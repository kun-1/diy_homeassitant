#include <Arduino.h>
#include <cstring>
#include <HTTPClient.h>
#include <math.h>
#include <Wire.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

#include "DEV_Config.h"
#include "EPD.h"
#include "GUI_Paint.h"
#include "trmnl_secrets.h"

namespace {

constexpr uint16_t SCREEN_WIDTH = 800;
constexpr uint16_t SCREEN_HEIGHT = 480;
constexpr size_t SCREEN_ROW_BYTES = SCREEN_WIDTH / 8;
constexpr size_t SCREEN_BYTES = SCREEN_ROW_BYTES * SCREEN_HEIGHT;
constexpr size_t BMP_HEADER_BYTES = 62;
constexpr size_t EPD_HEADER_BYTES = 4;
constexpr size_t EPD_IMAGE_BYTES = EPD_HEADER_BYTES + SCREEN_BYTES * 2;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
constexpr uint32_t RETRY_DELAY_MS = 15000;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 30000;
constexpr char FIRMWARE_VERSION[] = "1.2.0";
constexpr uint32_t PRINT_QUEUE_INTERVAL_MS = 5000;
constexpr uint32_t MAX_IMAGE_BYTES = 200000;
constexpr char SETUP_AP_PASSWORD_PREFIX[] = "Guozi-";
constexpr char DEFAULT_OFFICE_API_ORIGIN[] = "http://192.168.31.34:3100";
constexpr uint32_t PRINTER_BAUD = 115200;
constexpr uint32_t PRINTER_READY_TIMEOUT_MS = 30000;
constexpr uint32_t PRINTER_WIDTH_BYTES = 48;
constexpr uint32_t PRINTER_MAX_HEIGHT = 2000;
constexpr uint16_t PRINTER_RASTER_BAND_ROWS = 48;
constexpr uint32_t PRINTER_RASTER_BAND_RECOVERY_MS = 80;
constexpr int PRINTER_RX_PIN = 5;
constexpr int PRINTER_TX_PIN = 4;
constexpr int PRINTER_RTS_PIN = 6;
constexpr int UPS_I2C_SDA_PIN = 8;
constexpr int UPS_I2C_SCL_PIN = 9;
constexpr uint8_t INA219_ADDRESS_FIRST = 0x40;
constexpr uint8_t INA219_ADDRESS_LAST = 0x43;
constexpr uint8_t INA219_REGISTER_CONFIG = 0x00;
constexpr uint8_t INA219_REGISTER_SHUNT_VOLTAGE = 0x01;
constexpr uint8_t INA219_REGISTER_BUS_VOLTAGE = 0x02;
constexpr uint8_t INA219_REGISTER_CALIBRATION = 0x05;
constexpr float UPS_BATTERY_EMPTY_VOLTAGE = 9.3f;
constexpr float UPS_BATTERY_FULL_VOLTAGE = 12.6f;

Preferences preferences;
HardwareSerial printerSerial(1);
WebServer setupServer(80);
String wifiSsid;
String wifiPassword;
String serverOrigin;
String officeApiOrigin;
uint8_t *screenBuffer = nullptr;
uint8_t *ryBuffer = nullptr;
bool epdHasBeenCleared = false;
String lastImageFilename;
uint8_t ina219Address = 0;
bool batteryMonitorReady = false;
float lastBatteryVoltage = 0.0f;
uint32_t lastPrintQueuePollAt = 0;
enum class PrinterPaperState { Unknown, Ok, NearEnd, Out };
PrinterPaperState printerPaperState = PrinterPaperState::Unknown;
bool printerCoverOpen = false;
bool printerError = false;

String jsonString(const String &json, const char *key);
uint32_t jsonNumber(const String &json, const char *key, uint32_t fallback);
bool writeRasterBand(const uint8_t *bytes, uint16_t rows);

void initPrinterSerial() {
  pinMode(PRINTER_RTS_PIN, INPUT_PULLUP);
  printerSerial.begin(PRINTER_BAUD, SERIAL_8N1, PRINTER_RX_PIN, PRINTER_TX_PIN);
  // EM5823H TX uses a high-impedance high level. Keep ESP32 RX pulled up so
  // the idle UART line is stable without requiring an extra resistor during
  // the prototype stage.
  pinMode(PRINTER_RX_PIN, INPUT_PULLUP);
  Serial.printf("PRINTER_UART_READY baud=%lu rx=%d tx=%d rts=%d\n",
                static_cast<unsigned long>(PRINTER_BAUD), PRINTER_RX_PIN, PRINTER_TX_PIN, PRINTER_RTS_PIN);
}

bool waitPrinterReady(uint32_t timeoutMs = 3000) {
  const uint32_t started = millis();
  while (digitalRead(PRINTER_RTS_PIN) != LOW) {
    if (millis() - started >= timeoutMs) return false;
    delay(2);
  }
  return true;
}

bool printerReadStatus(uint8_t query, uint8_t &value) {
  while (printerSerial.available() > 0) printerSerial.read();
  // A disconnected printer leaves RTS high. Keep status probes short so the
  // display and heartbeat loops are never stalled by absent hardware.
  if (!waitPrinterReady(100)) return false;
  const uint8_t command[] = {0x10, 0x04, query};
  printerSerial.write(command, sizeof(command));
  printerSerial.flush();
  const uint32_t started = millis();
  while (printerSerial.available() <= 0) {
    if (millis() - started >= 1000) {
      Serial.printf("PRINTER_STATUS_TIMEOUT query=%u rts=%d\n", query, digitalRead(PRINTER_RTS_PIN));
      return false;
    }
    delay(2);
  }
  value = static_cast<uint8_t>(printerSerial.read());
  return true;
}

bool printerReadSensorStatus(uint8_t &value) {
  while (printerSerial.available() > 0) printerSerial.read();
  if (!waitPrinterReady(100)) return false;
  const uint8_t command[] = {0x1D, 0x72, 0x01};  // GS r 1: paper sensor status.
  printerSerial.write(command, sizeof(command));
  printerSerial.flush();
  const uint32_t started = millis();
  while (printerSerial.available() <= 0) {
    if (millis() - started >= 1000) {
      Serial.printf("PRINTER_SENSOR_STATUS_TIMEOUT rts=%d\n", digitalRead(PRINTER_RTS_PIN));
      return false;
    }
    delay(2);
  }
  value = static_cast<uint8_t>(printerSerial.read());
  return true;
}

bool updatePrinterStatus() {
  uint8_t offlineStatus = 0;
  uint8_t errorStatus = 0;
  uint8_t sensorStatus = 0;
  if (!printerReadStatus(2, offlineStatus) ||
      !printerReadStatus(3, errorStatus)) {
    printerPaperState = PrinterPaperState::Unknown;
    printerCoverOpen = false;
    printerError = false;
    return false;
  }
  const bool hasSensorStatus = printerReadSensorStatus(sensorStatus);
  printerCoverOpen = (offlineStatus & 0x04) != 0;
  // DLE EOT 3: bit 3 cutter, bit 5 unrecoverable, bit 6 head temperature/voltage.
  printerError = (offlineStatus & 0x40) != 0 ||
                 (errorStatus & 0x68) != 0;
  // The vendor protocol exposes paper-out through two independent commands:
  // DLE EOT 2 bit 5 and GS r 1 bits 2-3. The latter is required on this unit:
  // its offline byte can remain clear after the roll is exhausted.
  const bool paperOut = (offlineStatus & 0x20) != 0 ||
                        (hasSensorStatus && (sensorStatus & 0x0C) != 0);
  const bool paperNearEnd = hasSensorStatus && (sensorStatus & 0x03) != 0;
  printerPaperState = paperOut ? PrinterPaperState::Out :
                      paperNearEnd ? PrinterPaperState::NearEnd :
                      hasSensorStatus ? PrinterPaperState::Ok : PrinterPaperState::Unknown;
  return true;
}

void printPrinterStatusDiagnostic() {
  uint8_t online = 0, offline = 0, error = 0, paper = 0, sensor = 0;
  const bool hasOnline = printerReadStatus(1, online);
  const bool hasOffline = printerReadStatus(2, offline);
  const bool hasError = printerReadStatus(3, error);
  const bool hasPaper = printerReadStatus(4, paper);
  const bool hasSensor = printerReadSensorStatus(sensor);
  Serial.printf("PRINTER_STATUS_RAW q1=%s%02X q2=%s%02X q3=%s%02X q4=%s%02X gsr1=%s%02X rts=%d\n",
                hasOnline ? "" : "NA/", online,
                hasOffline ? "" : "NA/", offline,
                hasError ? "" : "NA/", error,
                hasPaper ? "" : "NA/", paper,
                hasSensor ? "" : "NA/", sensor,
                digitalRead(PRINTER_RTS_PIN));
  updatePrinterStatus();
  Serial.printf("PRINTER_STATUS_DECODED paper=%d cover=%d error=%d\n",
                static_cast<int>(printerPaperState), printerCoverOpen, printerError);
}

void printPrinterTestPage() {
  // EM5823H's documented default is 115200 baud with RTS hardware flow control.
  // Keep this page ASCII-only: it is the first physical transport test.
  const uint8_t reset[] = {0x1B, 0x40};
  const uint8_t center[] = {0x1B, 0x61, 0x01};
  const uint8_t left[] = {0x1B, 0x61, 0x00};
  const uint8_t boldOn[] = {0x1B, 0x45, 0x01};
  const uint8_t boldOff[] = {0x1B, 0x45, 0x00};
  printerSerial.write(reset, sizeof(reset));
  printerSerial.write(center, sizeof(center));
  printerSerial.write(boldOn, sizeof(boldOn));
  printerSerial.print("GUOZI PRINTER TEST\n");
  printerSerial.write(boldOff, sizeof(boldOff));
  printerSerial.print("EM5823H TTL / ESP32-S3\n");
  printerSerial.write(left, sizeof(left));
  printerSerial.print("UART link OK\n");
  printerSerial.print("GPIO4 TX -> printer RX\n");
  printerSerial.print("GPIO5 RX <- printer TX\n\n");
  printerSerial.print("- - - - - - - - - - - - - - - -\n");
  printerSerial.write(0x1B);
  printerSerial.write(0x64);
  printerSerial.write(0x03);
  printerSerial.flush();
  Serial.println("PRINTER_TEST_SENT");
}

void printTearGuide() {
  // EM5823H has no cutter in this wiring. Leave a clean manual tear guide
  // plus extra feed so the line is accessible without cutting the content.
  printerSerial.write(0x1B); printerSerial.write(0x61); printerSerial.write(0x00);
  printerSerial.print("- - - - - - - - - - - - - - - -\n");
  printerSerial.write(0x1B); printerSerial.write(0x64); printerSerial.write(0x04);
}

void printLetterText(const String &title, const String &body, const String &signature) {
  const uint8_t reset[] = {0x1B, 0x40};
  const uint8_t left[] = {0x1B, 0x61, 0x00};
  const uint8_t boldOn[] = {0x1B, 0x45, 0x01};
  const uint8_t boldOff[] = {0x1B, 0x45, 0x00};
  printerSerial.write(reset, sizeof(reset));
  printerSerial.write(left, sizeof(left));
  // ESC/POS code page 26 is PC936 / Simplified Chinese on this printer
  // family. Set it explicitly before sending GBK bytes.
  const uint8_t codePage936[] = {0x1B, 0x74, 0x1A};
  printerSerial.write(codePage936, sizeof(codePage936));
  const uint8_t gbkCodePage[] = {0x1C, 0x43, 0x00};
  printerSerial.write(gbkCodePage, sizeof(gbkCodePage));
  const uint8_t chineseMode[] = {0x1C, 0x26};
  printerSerial.write(chineseMode, sizeof(chineseMode));
  printerSerial.write(boldOn, sizeof(boldOn));
  printerSerial.print(title);
  printerSerial.print("\n");
  printerSerial.write(boldOff, sizeof(boldOff));
  printerSerial.print("------------------------------\n");
  printerSerial.print(body);
  printerSerial.print("\n\n");
  printerSerial.print("-- ");
  printerSerial.print(signature);
  printerSerial.print("\n");
  printTearGuide();
  printerSerial.flush();
}

void queryPrinterSetting(const char *code) {
  while (printerSerial.available() > 0) printerSerial.read();
  if (!waitPrinterReady(1000)) {
    Serial.printf("PRINTER_SETTING_SKIPPED code=%s rts=%d\n", code, digitalRead(PRINTER_RTS_PIN));
    return;
  }
  printerSerial.write(0x1E);
  printerSerial.write('#');
  printerSerial.print(code);
  printerSerial.print("?;");
  printerSerial.flush();
  const uint32_t started = millis();
  String response;
  while (millis() - started < 1500) {
    while (printerSerial.available() > 0) response += static_cast<char>(printerSerial.read());
    if (response.endsWith(";")) break;
    delay(2);
  }
  Serial.printf("PRINTER_SETTING code=%s response=%s\n", code, response.isEmpty() ? "<timeout>" : response.c_str());
}

void setPrinterSetting(const char *code, int value) {
  while (printerSerial.available() > 0) printerSerial.read();
  if (!waitPrinterReady(1000)) {
    Serial.printf("PRINTER_SETTING_SET_SKIPPED code=%s rts=%d\n", code, digitalRead(PRINTER_RTS_PIN));
    return;
  }
  printerSerial.write(0x1E);
  printerSerial.write('#');
  printerSerial.print(code);
  printerSerial.print('=');
  printerSerial.print(value);
  printerSerial.print(';');
  printerSerial.flush();
  const uint32_t started = millis();
  String response;
  while (millis() - started < 1500) {
    while (printerSerial.available() > 0) response += static_cast<char>(printerSerial.read());
    if (response.endsWith(";")) break;
    delay(2);
  }
  Serial.printf("PRINTER_SETTING_SET code=%s value=%d response=%s\n",
                code, value, response.isEmpty() ? "<timeout>" : response.c_str());
}

void printNativeChineseQualityTest() {
  // GB18030/PC936 byte sequences generated from the official sample phrases.
  // This test separates the printer's built-in 24x24 CJK font quality from
  // Mac-rendered 1-bit raster quality without relying on UTF-8 interpretation.
  static const uint8_t labelSong[] = {0xCB, 0xCE, 0xCC, 0xE5};
  static const uint8_t labelHei[] = {0xBA, 0xDA, 0xCC, 0xE5};
  static const uint8_t phrase[] = {
    0xD6, 0xD0, 0xCE, 0xC4, 0xD4, 0xAD, 0xC9, 0xFA, 0xD7, 0xD6, 0xBF, 0xE2,
    0x20,
    0xBD, 0xF1, 0xCC, 0xEC, 0xD2, 0xB2, 0xD2, 0xAA, 0xBA, 0xC3, 0xBA, 0xC3,
    0xC9, 0xFA, 0xBB, 0xEE
  };
  const uint8_t reset[] = {0x1B, 0x40};
  const uint8_t left[] = {0x1B, 0x61, 0x00};
  const uint8_t codePage936[] = {0x1B, 0x74, 0x00};
  const uint8_t chineseMode[] = {0x1C, 0x26};
  const uint8_t normalCjk[] = {0x1C, 0x21, 0x00};
  const uint8_t normalWeight[] = {0x1B, 0x45, 0x00};
  setPrinterSetting("LSLG", 0);
  setPrinterSetting("CHSM", 1);
  setPrinterSetting("PTFS", 1);
  if (!waitPrinterReady()) return;
  printerSerial.write(reset, sizeof(reset));
  printerSerial.write(left, sizeof(left));
  printerSerial.write(codePage936, sizeof(codePage936));
  printerSerial.write(chineseMode, sizeof(chineseMode));
  printerSerial.write(normalCjk, sizeof(normalCjk));
  printerSerial.write(normalWeight, sizeof(normalWeight));
  printerSerial.print("NATIVE 24x24 / ");
  printerSerial.write(labelSong, sizeof(labelSong));
  printerSerial.print("\n");
  printerSerial.write(phrase, sizeof(phrase));
  printerSerial.print("\n");
  printerSerial.flush();
  delay(100);
  if (!waitPrinterReady()) return;
  setPrinterSetting("PTFS", 2);
  if (!waitPrinterReady()) return;
  printerSerial.write(left, sizeof(left));
  printerSerial.write(codePage936, sizeof(codePage936));
  printerSerial.write(chineseMode, sizeof(chineseMode));
  printerSerial.write(normalCjk, sizeof(normalCjk));
  printerSerial.write(normalWeight, sizeof(normalWeight));
  printerSerial.print("NATIVE 24x24 / ");
  printerSerial.write(labelHei, sizeof(labelHei));
  printerSerial.print("\n");
  printerSerial.write(phrase, sizeof(phrase));
  printerSerial.print("\n");
  printTearGuide();
  printerSerial.flush();
  Serial.println("PRINTER_NATIVE_CJK_TEST_SENT encoding=PC936 fonts=SONG,HEI");
}

int base64Value(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

bool writeBase64Field(const String &json, const char *key) {
  const String encoded = jsonString(json, key);
  uint32_t accumulator = 0;
  int bits = -8;
  for (size_t i = 0; i < encoded.length(); i++) {
    const int value = base64Value(encoded[i]);
    if (value < 0) continue;
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 0) {
      if (!waitPrinterReady()) return false;
      printerSerial.write(static_cast<uint8_t>((accumulator >> bits) & 0xff));
      bits -= 8;
    }
  }
  return true;
}

bool writePrinterByte(uint8_t value, uint32_t timeoutMs = PRINTER_READY_TIMEOUT_MS) {
  if (!waitPrinterReady(timeoutMs)) return false;
  printerSerial.write(value);
  return true;
}

bool calibrationPixel(uint16_t x, uint16_t y) {
  if (y < 16) return (x % 8U) == 0;                  // one-dot vertical strokes
  if (y < 32) return (x % 8U) < 2;                   // two-dot vertical strokes
  if (y < 48) return (x % 8U) < 4;                   // four-dot vertical strokes
  if (y < 64) return ((x / 2U) + (y / 2U)) % 2U == 0; // 2x2 checker
  if (y < 80) {
    return (x < 64U) || (x >= 128U && x < 192U) ||
           (x >= 256U && x < 320U);                  // bounded solid fills
  }
  return (y % 4U) == 0;                              // one-dot horizontal strokes
}

bool printRasterCalibrationStrip() {
  // A short, deterministic target for separating native-font quality from
  // raster-dot quality without wasting a full 480-row card. The pattern uses
  // modest black coverage, except for several small fill blocks, so it is safe
  // for normal quality tuning and still reveals weak dots or paper slip.
  constexpr uint16_t height = 96;
  constexpr uint16_t widthBytes = PRINTER_WIDTH_BYTES;
  const uint8_t reset[] = {0x1B, 0x40};
  const uint8_t left[] = {0x1B, 0x61, 0x00};
  if (!waitPrinterReady()) return false;
  printerSerial.write(reset, sizeof(reset));
  printerSerial.write(left, sizeof(left));
  printerSerial.print("NATIVE FONT 0123456789 ABC\n");
  printerSerial.print("RASTER: 1PX / 2PX / 4PX / FILL\n");

  uint8_t band[widthBytes * PRINTER_RASTER_BAND_ROWS];
  for (uint16_t bandY = 0; bandY < height; bandY += PRINTER_RASTER_BAND_ROWS) {
    const uint16_t rows = min(static_cast<uint16_t>(PRINTER_RASTER_BAND_ROWS),
                              static_cast<uint16_t>(height - bandY));
    for (uint16_t localY = 0; localY < rows; localY++) {
      const uint16_t y = bandY + localY;
      for (uint16_t byteX = 0; byteX < widthBytes; byteX++) {
        uint8_t value = 0;
        for (uint8_t bit = 0; bit < 8; bit++) {
          const uint16_t x = byteX * 8U + bit;
          if (calibrationPixel(x, y)) value |= static_cast<uint8_t>(0x80U >> bit);
        }
        band[static_cast<size_t>(localY) * widthBytes + byteX] = value;
      }
    }
    if (!writeRasterBand(band, rows)) {
      Serial.printf("PRINTER_CALIBRATION_ABORTED row=%u rows=%u rts=%d\n",
                    bandY, rows, digitalRead(PRINTER_RTS_PIN));
      return false;
    }
  }
  printerSerial.print("\n");
  printTearGuide();
  printerSerial.flush();
  Serial.printf("PRINTER_CALIBRATION_SENT mode=GS_V_0_BANDED height=96 band_rows=%u\n",
                PRINTER_RASTER_BAND_ROWS);
  return true;
}

bool printEscStarCalibrationStrip() {
  // Print the same 96-row target using the legacy 24-dot double-density
  // command. This is a controlled A/B against GS v 0 at the same 203x203 DPI.
  constexpr uint16_t width = PRINTER_WIDTH_BYTES * 8U;
  constexpr uint16_t height = 96;
  constexpr uint8_t bandHeight = 24;
  const uint8_t reset[] = {0x1B, 0x40};
  const uint8_t left[] = {0x1B, 0x61, 0x00};
  const uint8_t lineSpacing24[] = {0x1B, 0x33, bandHeight};
  const uint8_t defaultLineSpacing[] = {0x1B, 0x32};
  if (!waitPrinterReady()) return false;
  printerSerial.write(reset, sizeof(reset));
  printerSerial.write(left, sizeof(left));
  printerSerial.print("NATIVE FONT 0123456789 ABC\n");
  printerSerial.print("ESC STAR 33: 1PX / 2PX / 4PX / FILL\n");
  printerSerial.write(lineSpacing24, sizeof(lineSpacing24));

  for (uint16_t bandY = 0; bandY < height; bandY += bandHeight) {
    const uint8_t command[] = {
      0x1B, 0x2A, 33,
      static_cast<uint8_t>(width & 0xff),
      static_cast<uint8_t>((width >> 8) & 0xff)
    };
    if (!waitPrinterReady()) return false;
    printerSerial.write(command, sizeof(command));
    for (uint16_t x = 0; x < width; x++) {
      for (uint8_t verticalByte = 0; verticalByte < 3; verticalByte++) {
        uint8_t value = 0;
        for (uint8_t bit = 0; bit < 8; bit++) {
          const uint16_t y = bandY + verticalByte * 8U + bit;
          if (calibrationPixel(x, y)) value |= static_cast<uint8_t>(0x80U >> bit);
        }
        if (!writePrinterByte(value)) {
          Serial.printf("PRINTER_ESC_STAR_CALIBRATION_ABORTED band=%u x=%u byte=%u rts=%d\n",
                        bandY, x, verticalByte, digitalRead(PRINTER_RTS_PIN));
          return false;
        }
      }
    }
    if (!writePrinterByte('\n')) return false;
  }
  printerSerial.write(defaultLineSpacing, sizeof(defaultLineSpacing));
  printTearGuide();
  printerSerial.flush();
  Serial.println("PRINTER_CALIBRATION_SENT mode=ESC_STAR_33 height=96");
  return true;
}

bool writeBase64String(const String &encoded) {
  uint32_t accumulator = 0;
  int bits = -8;
  for (size_t i = 0; i < encoded.length(); i++) {
    const int value = base64Value(encoded[i]);
    if (value < 0) continue;
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 0) {
      if (!writePrinterByte(static_cast<uint8_t>((accumulator >> bits) & 0xff))) return false;
      bits -= 8;
    }
  }
  return true;
}

bool writeRasterBand(const uint8_t *bytes, uint16_t rows) {
  const uint8_t command[] = {
    0x1D, 0x76, 0x30, 0x00,
    static_cast<uint8_t>(PRINTER_WIDTH_BYTES & 0xff),
    static_cast<uint8_t>((PRINTER_WIDTH_BYTES >> 8) & 0xff),
    static_cast<uint8_t>(rows & 0xff),
    static_cast<uint8_t>((rows >> 8) & 0xff)
  };
  if (!waitPrinterReady()) return false;
  printerSerial.write(command, sizeof(command));
  const size_t length = static_cast<size_t>(rows) * PRINTER_WIDTH_BYTES;
  for (size_t i = 0; i < length; i++) {
    if (!writePrinterByte(bytes[i])) return false;
  }
  // Wait for the complete band to leave the UART before allowing the supply
  // and the thermal head a short recovery window. Consecutive GS v 0 bands do
  // not add blank feed rows, so the card remains visually continuous.
  printerSerial.flush();
  delay(PRINTER_RASTER_BAND_RECOVERY_MS);
  return waitPrinterReady();
}

bool writeRasterBase64InBands(const String &encoded, size_t expectedLength) {
  uint8_t band[PRINTER_WIDTH_BYTES * PRINTER_RASTER_BAND_ROWS];
  size_t bandLength = 0;
  size_t totalWritten = 0;
  uint32_t accumulator = 0;
  int bits = -8;
  for (size_t i = 0; i < encoded.length(); i++) {
    const int value = base64Value(encoded[i]);
    if (value < 0) continue;
    accumulator = (accumulator << 6) | static_cast<uint32_t>(value);
    bits += 6;
    if (bits < 0) continue;
    if (totalWritten >= expectedLength) {
      Serial.println("PRINT_RASTER_ABORTED decoded_data_too_long");
      return false;
    }
    band[bandLength++] = static_cast<uint8_t>((accumulator >> bits) & 0xff);
    bits -= 8;
    totalWritten++;
    if (bandLength == sizeof(band)) {
      if (!writeRasterBand(band, PRINTER_RASTER_BAND_ROWS)) {
        Serial.printf("PRINT_RASTER_ABORTED row=%u rows=%u rts=%d\n",
                      static_cast<unsigned>((totalWritten - bandLength) / PRINTER_WIDTH_BYTES),
                      PRINTER_RASTER_BAND_ROWS, digitalRead(PRINTER_RTS_PIN));
        return false;
      }
      bandLength = 0;
    }
  }
  if (totalWritten != expectedLength || bandLength % PRINTER_WIDTH_BYTES != 0) {
    Serial.printf("PRINT_RASTER_ABORTED decoded=%u expected=%u remainder=%u\n",
                  static_cast<unsigned>(totalWritten), static_cast<unsigned>(expectedLength),
                  static_cast<unsigned>(bandLength));
    return false;
  }
  if (bandLength > 0) {
    const uint16_t rows = static_cast<uint16_t>(bandLength / PRINTER_WIDTH_BYTES);
    if (!writeRasterBand(band, rows)) {
      Serial.printf("PRINT_RASTER_ABORTED row=%u rows=%u rts=%d\n",
                    static_cast<unsigned>((totalWritten - bandLength) / PRINTER_WIDTH_BYTES),
                    rows, digitalRead(PRINTER_RTS_PIN));
      return false;
    }
  }
  return true;
}

size_t base64DecodedLength(const String &encoded) {
  size_t symbols = 0;
  for (size_t i = 0; i < encoded.length(); i++) {
    if (base64Value(encoded[i]) >= 0) symbols++;
  }
  return (symbols * 6U) / 8U;
}

bool printRasterCard(const String &json) {
  const uint32_t widthBytes = jsonNumber(json, "widthBytes", PRINTER_WIDTH_BYTES);
  const uint32_t height = jsonNumber(json, "height", 480);
  const String bitmap = jsonString(json, "bitmapB64");
  const size_t decodedLength = base64DecodedLength(bitmap);
  const size_t expectedLength = static_cast<size_t>(widthBytes) * height;
  if (widthBytes != PRINTER_WIDTH_BYTES || height == 0 || height > PRINTER_MAX_HEIGHT ||
      decodedLength != expectedLength) {
    Serial.printf("PRINT_RASTER_REJECTED width_bytes=%lu height=%lu decoded=%u expected=%u\n",
                  static_cast<unsigned long>(widthBytes), static_cast<unsigned long>(height),
                  static_cast<unsigned>(decodedLength), static_cast<unsigned>(expectedLength));
    return false;
  }
  if (!writeRasterBase64InBands(bitmap, expectedLength)) return false;
  printerSerial.print("\n\n");
  printTearGuide();
  printerSerial.flush();
  Serial.printf("PRINT_RASTER_SENT height=%lu band_rows=%u recovery_ms=%lu\n",
                static_cast<unsigned long>(height), PRINTER_RASTER_BAND_ROWS,
                static_cast<unsigned long>(PRINTER_RASTER_BAND_RECOVERY_MS));
  return true;
}

bool printEncodedLetter(const String &json) {
  const uint8_t reset[] = {0x1B, 0x40};
  const uint8_t left[] = {0x1B, 0x61, 0x00};
  const uint8_t boldOn[] = {0x1B, 0x45, 0x01};
  const uint8_t boldOff[] = {0x1B, 0x45, 0x00};
  if (!waitPrinterReady()) return false;
  printerSerial.write(reset, sizeof(reset));
  printerSerial.write(left, sizeof(left));
  if (!jsonString(json, "bitmapB64").isEmpty()) {
    return printRasterCard(json);
  }
  // ESC/POS Chinese mode: FS & (1C 26). The backend sends GBK bytes after
  // this mode is enabled; sending UTF-8 bytes here produces garbage glyphs.
  const uint8_t codePage936[] = {0x1B, 0x74, 0x1A};
  printerSerial.write(codePage936, sizeof(codePage936));
  const uint8_t gbkCodePage[] = {0x1C, 0x43, 0x00};
  printerSerial.write(gbkCodePage, sizeof(gbkCodePage));
  const uint8_t chineseMode[] = {0x1C, 0x26};
  printerSerial.write(chineseMode, sizeof(chineseMode));
  printerSerial.write(boldOn, sizeof(boldOn));
  if (!writeBase64Field(json, "titleB64")) return false;
  printerSerial.print("\n");
  printerSerial.write(boldOff, sizeof(boldOff));
  printerSerial.print("------------------------------\n");
  if (!writeBase64Field(json, "bodyB64")) return false;
  printerSerial.print("\n\n-- ");
  if (!writeBase64Field(json, "signatureB64")) return false;
  printerSerial.print("\n");
  printTearGuide();
  printerSerial.flush();
  return true;
}

void handleConsoleCommands() {
  while (Serial.available() > 0) {
    const char command = static_cast<char>(Serial.read());
    if (command == 'p' || command == 'P') {
      printPrinterTestPage();
    } else if (command == 'c' || command == 'C') {
      printRasterCalibrationStrip();
    } else if (command == 'x' || command == 'X') {
      printEscStarCalibrationStrip();
    } else if (command == 'n' || command == 'N') {
      printNativeChineseQualityTest();
    } else if (command == 's' || command == 'S') {
      printPrinterStatusDiagnostic();
    } else if (command == 'd' || command == 'D') {
      queryPrinterSetting("PTDP");
      queryPrinterSetting("PHSP");
      // EM5823H quality diagnostics. These are read-only so we can separate
      // raster problems from power/current/thermal problems before tuning.
      queryPrinterSetting("CUCL");
      queryPrinterSetting("SPMD");
      queryPrinterSetting("PTVL");
      queryPrinterSetting("PTTE");
    } else if (command == 'q' || command == 'Q') {
      // Quality-first preset for 384-dot raster cards. On this printer a
      // larger CUCL value means a lower peak current and slower output. Pair
      // that with wide-voltage mode and a low speed so dense CJK rows stay
      // dark without collapsing a marginal supply under a short current peak.
      setPrinterSetting("CUCL", 7);
      setPrinterSetting("SPMD", 3);
      setPrinterSetting("PTDP", 25);
      setPrinterSetting("PHSP", 1);
      queryPrinterSetting("CUCL");
      queryPrinterSetting("SPMD");
      queryPrinterSetting("PTDP");
      queryPrinterSetting("PHSP");
      queryPrinterSetting("PTVL");
      queryPrinterSetting("PTTE");
    } else if (command == 'b' || command == 'B') {
      // Previously verified baseline, kept as an immediate rollback target.
      setPrinterSetting("CUCL", 7);
      setPrinterSetting("SPMD", 3);
      setPrinterSetting("PTDP", 25);
      setPrinterSetting("PHSP", 1);
      queryPrinterSetting("CUCL");
      queryPrinterSetting("SPMD");
      queryPrinterSetting("PTDP");
      queryPrinterSetting("PHSP");
      queryPrinterSetting("PTVL");
      queryPrinterSetting("PTTE");
    }
  }
}

bool ina219Write16(uint8_t reg, uint16_t value) {
  Wire.beginTransmission(ina219Address);
  Wire.write(reg);
  Wire.write(static_cast<uint8_t>(value >> 8));
  Wire.write(static_cast<uint8_t>(value & 0xff));
  return Wire.endTransmission() == 0;
}

bool ina219Read16(uint8_t reg, uint16_t &value) {
  Wire.beginTransmission(ina219Address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(static_cast<int>(ina219Address), 2) != 2) {
    return false;
  }
  value = static_cast<uint16_t>(Wire.read()) << 8;
  value |= static_cast<uint16_t>(Wire.read());
  return true;
}

void initBatteryMonitor() {
  Wire.begin(UPS_I2C_SDA_PIN, UPS_I2C_SCL_PIN, 100000);
  for (uint8_t address = INA219_ADDRESS_FIRST; address <= INA219_ADDRESS_LAST; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      ina219Address = address;
      break;
    }
  }
  if (ina219Address == 0) {
    Serial.printf("UPS_MONITOR_UNAVAILABLE sda=%d scl=%d\n", UPS_I2C_SDA_PIN, UPS_I2C_SCL_PIN);
    return;
  }

  // Match Waveshare's INA219 setup: 32 V bus range, 320 mV shunt range,
  // 12-bit/32-sample conversion, continuous shunt+bus measurement.
  const uint16_t config = static_cast<uint16_t>((1 << 13) | (3 << 11) | (0x0D << 7) | (0x0D << 3) | 0x07);
  batteryMonitorReady = ina219Write16(INA219_REGISTER_CALIBRATION, 0x1000) &&
                        ina219Write16(INA219_REGISTER_CONFIG, config);
  Serial.printf("UPS_MONITOR_%s addr=0x%02X sda=%d scl=%d\n",
                batteryMonitorReady ? "READY" : "FAILED", ina219Address,
                UPS_I2C_SDA_PIN, UPS_I2C_SCL_PIN);
}

bool readBatteryPercent(int &percent) {
  if (!batteryMonitorReady) {
    return false;
  }
  uint16_t busRaw = 0;
  uint16_t shuntRaw = 0;
  if (!ina219Read16(INA219_REGISTER_BUS_VOLTAGE, busRaw) ||
      !ina219Read16(INA219_REGISTER_SHUNT_VOLTAGE, shuntRaw)) {
    Serial.println("UPS_READ_FAILED ina219_register");
    return false;
  }
  const float busVoltage = static_cast<float>(busRaw >> 3) * 0.004f;
  const int16_t signedShuntRaw = static_cast<int16_t>(shuntRaw);
  const float batteryVoltage = busVoltage + (static_cast<float>(signedShuntRaw) * 0.01f / 1000.0f);
  if (batteryVoltage < 0.0f || batteryVoltage > 15.0f) {
    Serial.printf("UPS_READ_FAILED voltage=%.3f\n", batteryVoltage);
    return false;
  }
  lastBatteryVoltage = batteryVoltage;
  const float ratio = (batteryVoltage - UPS_BATTERY_EMPTY_VOLTAGE) /
                      (UPS_BATTERY_FULL_VOLTAGE - UPS_BATTERY_EMPTY_VOLTAGE);
  percent = static_cast<int>(lroundf(constrain(ratio, 0.0f, 1.0f) * 100.0f));
  Serial.printf("UPS_BATTERY voltage=%.3f percent=%d\n", batteryVoltage, percent);
  return true;
}

String htmlEscape(const String &value) {
  String result = value;
  result.replace("&", "&amp;");
  result.replace("\"", "&quot;");
  result.replace("<", "&lt;");
  result.replace(">", "&gt;");
  return result;
}

void loadConfig() {
  preferences.begin("eink-trmnl", false);
  wifiSsid = preferences.getString("wifi_ssid", DEFAULT_WIFI_SSID);
  wifiPassword = preferences.getString("wifi_pass", DEFAULT_WIFI_PASSWORD);
  serverOrigin = preferences.getString("server", DEFAULT_SERVER_ORIGIN);
  officeApiOrigin = preferences.getString("api", DEFAULT_OFFICE_API_ORIGIN);
  serverOrigin.trim();
  officeApiOrigin.trim();
  // The display renderer remains on 3000; the business API/heartbeat is on 3100.
  // Migrate the temporary single-origin value used during the UART test.
  if (serverOrigin == "http://192.168.31.34:3100") {
    serverOrigin = DEFAULT_SERVER_ORIGIN;
    preferences.putString("server", serverOrigin);
  }
  while (serverOrigin.endsWith("/")) {
    serverOrigin.remove(serverOrigin.length() - 1);
  }
  while (officeApiOrigin.endsWith("/")) {
    officeApiOrigin.remove(officeApiOrigin.length() - 1);
  }
}

String setupApName() {
  const uint64_t chipId = ESP.getEfuseMac();
  char suffix[9];
  snprintf(suffix, sizeof(suffix), "%08lx", static_cast<unsigned long>(chipId & 0xffffffff));
  return String("Eink-Setup-") + suffix;
}

String setupApPassword() {
  const uint64_t chipId = ESP.getEfuseMac();
  char suffix[9];
  snprintf(suffix, sizeof(suffix), "%08lx", static_cast<unsigned long>(chipId & 0xffffffff));
  return String(SETUP_AP_PASSWORD_PREFIX) + String(suffix);
}

bool validServerOrigin(const String &value) {
  return (value.startsWith("http://") || value.startsWith("https://")) &&
         value.indexOf(' ') < 0 && value.indexOf('\n') < 0 && value.indexOf('\r') < 0;
}

void startSetupMode() {
  const String apName = setupApName();
  const String apPassword = setupApPassword();
  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(apName.c_str(), apPassword.c_str())) {
    Serial.println("PROVISIONING_FAILED softap_start");
    while (true) {
      delay(1000);
    }
  }

  setupServer.on("/", HTTP_GET, []() {
    const String page =
        "<!doctype html><html lang='zh-CN'><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>电子墨水屏配置</title>"
        "<style>body{font:16px system-ui;max-width:560px;margin:32px auto;padding:0 18px}"
        "label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;font-size:16px}"
        "button{margin-top:24px;padding:12px 18px;font-size:16px}</style>"
        "<h1>电子墨水屏联网配置</h1>"
        "<p>填写 2.4GHz Wi‑Fi，以及 Mac mini 的两个服务地址。</p>"
        "<p>这是本地配置入口，不提供 captive portal 自动跳转。</p>"
        "<form method='post' action='/save'>"
        "<label>Wi‑Fi 名称</label><input name='ssid' required value='" + htmlEscape(wifiSsid) + "'>"
        "<label>Wi‑Fi 密码</label><input name='password' type='password' autocomplete='new-password'>"
        "<label>E-ink 渲染地址</label><input name='server' value='" + htmlEscape(serverOrigin) + "' required>"
        "<label>业务 API 地址</label><input name='api' value='" + htmlEscape(officeApiOrigin) + "' required>"
        "<button type='submit'>保存并连接</button></form></html>";
    setupServer.send(200, "text/html; charset=utf-8", page);
  });

  setupServer.on("/save", HTTP_POST, []() {
    if (!setupServer.hasArg("ssid") || !setupServer.hasArg("server") || !setupServer.hasArg("api")) {
      setupServer.send(400, "text/plain; charset=utf-8", "缺少 Wi-Fi、渲染地址或业务 API 地址");
      return;
    }
    String candidateSsid = setupServer.arg("ssid");
    String candidatePassword = setupServer.arg("password");
    String candidateServer = setupServer.arg("server");
    String candidateApi = setupServer.arg("api");
    candidateSsid.trim();
    candidatePassword.trim();
    candidateServer.trim();
    candidateApi.trim();
    if (candidateSsid.isEmpty() || candidateSsid.length() > 32 ||
        candidatePassword.length() > 63 ||
        (!candidatePassword.isEmpty() && candidatePassword.length() < 8) ||
        !validServerOrigin(candidateServer) || !validServerOrigin(candidateApi)) {
      setupServer.send(400, "text/plain; charset=utf-8",
                       "配置无效：SSID 不能为空且不超过 32 字符；Wi-Fi 密码为空或 8-63 字符；两个服务地址须以 http:// 或 https:// 开头。");
      return;
    }
    wifiSsid = candidateSsid;
    wifiPassword = candidatePassword;
    serverOrigin = candidateServer;
    officeApiOrigin = candidateApi;
    while (serverOrigin.endsWith("/")) {
      serverOrigin.remove(serverOrigin.length() - 1);
    }
    while (officeApiOrigin.endsWith("/")) {
      officeApiOrigin.remove(officeApiOrigin.length() - 1);
    }
    preferences.putString("wifi_ssid", wifiSsid);
    preferences.putString("wifi_pass", wifiPassword);
    preferences.putString("server", serverOrigin);
    preferences.putString("api", officeApiOrigin);
    setupServer.send(200, "text/html; charset=utf-8", "<h1>已保存</h1><p>设备正在重启并连接 Wi‑Fi，请等待屏幕刷新。</p>");
    delay(1200);
    ESP.restart();
  });

  setupServer.begin();
  Serial.printf("PROVISIONING_STATE=SOFTAP ap=%s password=%s\n", apName.c_str(), apPassword.c_str());
  Serial.println("SETUP_URL=http://192.168.4.1/");
  Serial.println("请手动连接该热点并访问配置页；当前不提供 captive portal 自动跳转。");
  while (true) {
    setupServer.handleClient();
    delay(10);
  }
}

bool connectWifi() {
  if (wifiSsid.isEmpty()) {
    return false;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  Serial.printf("WIFI_CONNECT ssid=%s\n", wifiSsid.c_str());
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("WIFI_FAILED status=%d\n", static_cast<int>(WiFi.status()));
    return false;
  }
  Serial.printf("WIFI_CONNECTED ip=%s gateway=%s rssi=%d\n",
                WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(), WiFi.RSSI());
  return true;
}

bool sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  int powerBankPercent = -1;
  const bool hasPowerBankReading = readBatteryPercent(powerBankPercent);
  String payload = "{\"batteryPct\":null,\"powerBankPct\":";
  payload += hasPowerBankReading ? String(powerBankPercent) : String("null");
  payload += ",\"firmwareVersion\":\"";
  payload += FIRMWARE_VERSION;
  payload += "\",\"wifiRssiDbm\":";
  payload += String(WiFi.RSSI());
  payload += ",\"uptimeSeconds\":";
  payload += String(millis() / 1000UL);
  payload += ",\"chipTemperatureC\":";
  payload += String(temperatureRead(), 1);
  payload += ",\"ipAddress\":\"";
  payload += WiFi.localIP().toString();
  payload += "\"";
  payload += "}";
  HTTPClient heartbeat;
  heartbeat.begin(officeApiOrigin + "/api/devices/esp32-01/heartbeat");
  heartbeat.addHeader("content-type", "application/json");
  heartbeat.setTimeout(5000);
  const int status = heartbeat.POST(payload);
  if (status != HTTP_CODE_OK) {
    Serial.printf("HEARTBEAT_FAILED http=%d error=%s\n", status, heartbeat.errorToString(status).c_str());
    heartbeat.end();
    return false;
  }
  Serial.println("HEARTBEAT_OK");
  heartbeat.end();
  const bool printerResponded = updatePrinterStatus();
  if (!printerResponded) {
    Serial.printf("PRINTER_HEARTBEAT_SKIPPED rts=%d\n", digitalRead(PRINTER_RTS_PIN));
    return true;
  }
  const char *paper = printerPaperState == PrinterPaperState::Ok ? "ok" :
                      printerPaperState == PrinterPaperState::NearEnd ? "near_end" :
                      printerPaperState == PrinterPaperState::Out ? "out" : "unknown";
  HTTPClient printerHeartbeat;
  printerHeartbeat.begin(officeApiOrigin + "/api/devices/printer-01/heartbeat");
  printerHeartbeat.addHeader("content-type", "application/json");
  printerHeartbeat.setTimeout(5000);
  String printerPayload = String("{\"batteryPct\":null,\"paperStatus\":\"") + paper +
                          "\",\"coverOpen\":" + (printerCoverOpen ? "true" : "false") +
                          ",\"printerError\":" + (printerError ? "true" : "false") + "}";
  printerHeartbeat.POST(printerPayload);
  printerHeartbeat.end();
  return true;
}

bool pollPrintQueue() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!waitPrinterReady(100)) {
    Serial.println("PRINT_QUEUE_DEFERRED printer_busy_or_rts_disconnected");
    updatePrinterStatus();
    return false;
  }
  const bool hasPrinterStatus = updatePrinterStatus();
  if (!hasPrinterStatus || printerPaperState != PrinterPaperState::Ok || printerCoverOpen || printerError) {
    Serial.printf("PRINT_QUEUE_DEFERRED paper=%d cover=%d error=%d\n",
                  static_cast<int>(printerPaperState), printerCoverOpen, printerError);
    return false;
  }
  HTTPClient api;
  api.begin(officeApiOrigin + "/api/print/jobs/next");
  api.setTimeout(8000);
  const int status = api.GET();
  if (status == HTTP_CODE_NO_CONTENT) { api.end(); return true; }
  if (status != HTTP_CODE_OK) {
    Serial.printf("PRINT_QUEUE_FAILED http=%d error=%s\n", status, api.errorToString(status).c_str());
    api.end();
    return false;
  }
  const String response = api.getString();
  api.end();
  const String jobId = jsonString(response, "id");
  if (jobId.isEmpty()) { Serial.println("PRINT_QUEUE_FAILED missing_job"); return false; }
  if (!printEncodedLetter(response)) {
    HTTPClient failed;
    failed.begin(officeApiOrigin + "/api/print/jobs/" + jobId + "/fail");
    failed.addHeader("content-type", "application/json");
    failed.setTimeout(8000);
    // A partially delivered GS v 0 frame leaves the printer waiting for the
    // remaining raster bytes. Retrying automatically can interpret the next
    // command as image data and cause garbage or continuous paper feed.
    const int failedStatus = failed.POST("{\"error\":\"raster transport interrupted; power-cycle printer before creating a new job\",\"retryable\":false}");
    failed.end();
    Serial.printf("PRINT_JOB_FAILED job=%s http=%d\n", jobId.c_str(), failedStatus);
    return false;
  }
  HTTPClient complete;
  complete.begin(officeApiOrigin + "/api/print/jobs/" + jobId + "/complete");
  complete.setTimeout(8000);
  const int completeStatus = complete.POST("");
  complete.end();
  if (completeStatus != HTTP_CODE_OK) {
    Serial.printf("PRINT_COMPLETE_FAILED job=%s http=%d\n", jobId.c_str(), completeStatus);
    return false;
  }
  Serial.printf("PRINT_JOB_OK job=%s mode=RASTER_GS_V0\n", jobId.c_str());
  return true;
}

void waitWithHeartbeat(uint32_t seconds) {
  const uint32_t duration = seconds * 1000UL;
  const uint32_t startedAt = millis();
  uint32_t lastHeartbeatAt = startedAt;
  while (millis() - startedAt < duration) {
    handleConsoleCommands();
    if (millis() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      sendHeartbeat();
      lastHeartbeatAt = millis();
    }
    if (millis() - lastPrintQueuePollAt >= PRINT_QUEUE_INTERVAL_MS) {
      pollPrintQueue();
      lastPrintQueuePollAt = millis();
    }
    delay(250);
  }
}

bool readExact(WiFiClient &stream, uint8_t *buffer, size_t length) {
  size_t received = 0;
  const uint32_t startedAt = millis();
  while (received < length && millis() - startedAt < 30000) {
    const int available = stream.available();
    if (available > 0) {
      const size_t wanted = min(static_cast<size_t>(available), length - received);
      const int count = stream.readBytes(reinterpret_cast<char *>(buffer + received), wanted);
      if (count > 0) {
        received += static_cast<size_t>(count);
      }
    } else {
      delay(2);
    }
  }
  return received == length;
}

uint16_t readLe16(const uint8_t *data) {
  return static_cast<uint16_t>(data[0]) | (static_cast<uint16_t>(data[1]) << 8);
}

uint32_t readLe32(const uint8_t *data) {
  return static_cast<uint32_t>(data[0]) |
         (static_cast<uint32_t>(data[1]) << 8) |
         (static_cast<uint32_t>(data[2]) << 16) |
         (static_cast<uint32_t>(data[3]) << 24);
}

int32_t readLe32Signed(const uint8_t *data) {
  return static_cast<int32_t>(readLe32(data));
}

bool decodeBmp(const uint8_t *bmp, size_t length, uint8_t *output) {
  if (length < BMP_HEADER_BYTES || bmp[0] != 'B' || bmp[1] != 'M') {
    Serial.println("BMP_INVALID signature");
    return false;
  }
  const uint32_t pixelOffset = readLe32(bmp + 10);
  const uint32_t dibSize = readLe32(bmp + 14);
  const int32_t width = readLe32Signed(bmp + 18);
  const int32_t height = readLe32Signed(bmp + 22);
  const uint16_t planes = readLe16(bmp + 26);
  const uint16_t bitsPerPixel = readLe16(bmp + 28);
  const uint32_t compression = readLe32(bmp + 30);
  if (dibSize < 40 || width != SCREEN_WIDTH || abs(height) != SCREEN_HEIGHT || planes != 1 ||
      bitsPerPixel != 1 || compression != 0 || pixelOffset >= length || length > MAX_IMAGE_BYTES) {
    Serial.printf("BMP_UNSUPPORTED width=%ld height=%ld bpp=%u compression=%lu\n",
                  static_cast<long>(width), static_cast<long>(height), bitsPerPixel,
                  static_cast<unsigned long>(compression));
    return false;
  }
  const size_t sourceRowBytes = ((static_cast<size_t>(width) + 31) / 32) * 4;
  if (pixelOffset + sourceRowBytes * SCREEN_HEIGHT > length) {
    Serial.println("BMP_TRUNCATED");
    return false;
  }

  // The server emits palette index 0 as white and index 1 as black.
  // Inspect the palette so the decoder remains correct if that order changes.
  const uint8_t paletteOffset = 54;
  const uint32_t palette0Luma = static_cast<uint32_t>(bmp[paletteOffset]) + bmp[paletteOffset + 1] + bmp[paletteOffset + 2];
  const uint32_t palette1Luma = static_cast<uint32_t>(bmp[paletteOffset + 4]) + bmp[paletteOffset + 5] + bmp[paletteOffset + 6];
  const bool invert = palette0Luma > palette1Luma;
  for (uint16_t y = 0; y < SCREEN_HEIGHT; y++) {
    const uint16_t sourceY = height > 0 ? SCREEN_HEIGHT - 1 - y : y;
    const uint8_t *source = bmp + pixelOffset + static_cast<size_t>(sourceY) * sourceRowBytes;
    uint8_t *destination = output + static_cast<size_t>(y) * SCREEN_ROW_BYTES;
    for (size_t x = 0; x < SCREEN_ROW_BYTES; x++) {
      destination[x] = invert ? static_cast<uint8_t>(~source[x]) : source[x];
    }
  }
  return true;
}

bool decodeEpdPlanes(const uint8_t *image, size_t length) {
  if (length != EPD_IMAGE_BYTES || memcmp(image, "E2P1", EPD_HEADER_BYTES) != 0) {
    return false;
  }
  memcpy(screenBuffer, image + EPD_HEADER_BYTES, SCREEN_BYTES);
  memcpy(ryBuffer, image + EPD_HEADER_BYTES + SCREEN_BYTES, SCREEN_BYTES);
  return true;
}

String jsonString(const String &json, const char *key) {
  const String marker = String("\"") + key + "\":\"";
  const int start = json.indexOf(marker);
  if (start < 0) {
    return String();
  }
  const int valueStart = start + marker.length();
  const int valueEnd = json.indexOf('"', valueStart);
  if (valueEnd < 0) {
    return String();
  }
  String value = json.substring(valueStart, valueEnd);
  value.replace("\\/", "/");
  value.replace("\\n", "\n");
  value.replace("\\r", "\r");
  value.replace("\\t", "\t");
  value.replace("\\\"", "\"");
  value.replace("\\\\", "\\");
  return value;
}

uint32_t jsonNumber(const String &json, const char *key, uint32_t fallback) {
  const String marker = String("\"") + key + "\":";
  const int start = json.indexOf(marker);
  if (start < 0) {
    return fallback;
  }
  const int valueStart = start + marker.length();
  const int valueEnd = json.indexOf(',', valueStart);
  const String value = json.substring(valueStart, valueEnd < 0 ? json.length() : valueEnd);
  return static_cast<uint32_t>(value.toInt());
}

bool fetchAndDisplay(uint32_t &refreshSeconds) {
  HTTPClient api;
  const String apiUrl = serverOrigin + "/api/display";
  api.begin(apiUrl);
  api.addHeader("ID", TRMNL_DEVICE_ID);
  api.addHeader("access-token", TRMNL_ACCESS_TOKEN);
  api.addHeader("battery-voltage", "3.3");
  api.setTimeout(30000);
  const int apiStatus = api.GET();
  if (apiStatus != HTTP_CODE_OK) {
    Serial.printf("DISPLAY_API_FAILED http=%d error=%s\n", apiStatus, api.errorToString(apiStatus).c_str());
    api.end();
    return false;
  }
  const String response = api.getString();
  refreshSeconds = max<uint32_t>(30, jsonNumber(response, "refresh_rate", 900));
  const String imageFilename = jsonString(response, "filename");
  const String imageUrl = jsonString(response, "image_url");
  if (imageUrl.isEmpty()) {
    Serial.println("DISPLAY_API_FAILED missing image_url");
    api.end();
    return false;
  }
  api.end();
  if (!imageFilename.isEmpty() && imageFilename == lastImageFilename) {
    Serial.printf("DISPLAY_UNCHANGED refresh_seconds=%lu\n", static_cast<unsigned long>(refreshSeconds));
    return true;
  }

  HTTPClient image;
  image.begin(imageUrl);
  image.setTimeout(60000);
  const int imageStatus = image.GET();
  const int contentLength = image.getSize();
  if (imageStatus != HTTP_CODE_OK || contentLength <= 0 || contentLength > static_cast<int>(MAX_IMAGE_BYTES)) {
    Serial.printf("IMAGE_FAILED http=%d bytes=%d error=%s\n", imageStatus, contentLength, image.errorToString(imageStatus).c_str());
    image.end();
    return false;
  }
  uint8_t *bmp = static_cast<uint8_t *>(malloc(static_cast<size_t>(contentLength)));
  if (bmp == nullptr) {
    Serial.println("IMAGE_FAILED no_memory");
    image.end();
    return false;
  }
  WiFiClient *stream = image.getStreamPtr();
  const bool received = readExact(*stream, bmp, static_cast<size_t>(contentLength));
  image.end();
  bool decoded = false;
  if (received) {
    decoded = decodeEpdPlanes(bmp, static_cast<size_t>(contentLength));
    if (!decoded) {
      memset(ryBuffer, 0xFF, SCREEN_BYTES);
      decoded = decodeBmp(bmp, static_cast<size_t>(contentLength), screenBuffer);
    }
  }
  free(bmp);
  if (!decoded) {
    Serial.println("IMAGE_FAILED decode");
    return false;
  }

  DEV_Module_Init();
  if (!epdHasBeenCleared) {
    // One full clear is enough after switching to the B/W/R driver. A second
    // clear only adds another long flash sequence during boot/recovery.
    Serial.println("EPD_CLEAR recovery_once");
    EPD_7IN5B_V2_Init();
    EPD_7IN5B_V2_Clear();
    epdHasBeenCleared = true;
  }
  // Match the official B/W/R V2 demo sequence: after a full clear, re-enter the
  // fast-display initialization before sending the actual frame.
  EPD_7IN5B_V2_Init_Fast();
  EPD_7IN5B_V2_Display(screenBuffer, ryBuffer);
  EPD_7IN5B_V2_Sleep();
  lastImageFilename = imageFilename;
  Serial.printf("DISPLAY_OK bytes=%d refresh_seconds=%lu\n", contentLength, static_cast<unsigned long>(refreshSeconds));
  return true;
}

}  // namespace

void applyPrinterQualityPreset() {
  // EM5823H DW_V1.0.3 ranges: PTDP 0-39, CUCL 5-9,
  // PHSP 0-12, SPMD 1-4. The previous 36/9 combination made
  // dense raster rows bleed on this 5-9V unit. Use the documented
  // example concentration, mid current, slow speed and voltage-adaptive mode.
  if (!waitPrinterReady(1000)) {
    Serial.println("PRINTER_QUALITY_PRESET_SKIPPED printer_not_ready");
    return;
  }
  setPrinterSetting("CUCL", 7);
  setPrinterSetting("SPMD", 3);
  setPrinterSetting("PTDP", 25);
  setPrinterSetting("PHSP", 1);
  queryPrinterSetting("CUCL");
  queryPrinterSetting("SPMD");
  queryPrinterSetting("PTDP");
  queryPrinterSetting("PHSP");
  queryPrinterSetting("PTVL");
  queryPrinterSetting("PTTE");
  Serial.println("PRINTER_QUALITY_PRESET_APPLIED profile=balanced-raster");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.printf("IOT_DISPLAY_BOOT version=%s\\n", FIRMWARE_VERSION);
  initPrinterSerial();
  applyPrinterQualityPreset();
  loadConfig();
  initBatteryMonitor();
  screenBuffer = static_cast<uint8_t *>(malloc(SCREEN_BYTES));
  ryBuffer = static_cast<uint8_t *>(malloc(SCREEN_BYTES));
  if (screenBuffer == nullptr || ryBuffer == nullptr) {
    Serial.println("FATAL no_screen_buffers");
    while (true) {
      delay(1000);
    }
  }
  // The 075RW panel is the B/W/R family. Keep the red/yellow plane white.
  memset(ryBuffer, 0xFF, SCREEN_BYTES);
  if (!connectWifi()) {
    startSetupMode();
  }
  sendHeartbeat();
  pollPrintQueue();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED && !connectWifi()) {
    waitWithHeartbeat(RETRY_DELAY_MS / 1000);
    return;
  }
  uint32_t refreshSeconds = 900;
  if (!fetchAndDisplay(refreshSeconds)) {
    sendHeartbeat();
    waitWithHeartbeat(RETRY_DELAY_MS / 1000);
    return;
  }
  sendHeartbeat();
  waitWithHeartbeat(refreshSeconds);
}
