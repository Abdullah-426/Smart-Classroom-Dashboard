#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <math.h>
#include <SPI.h>
#include <MFRC522.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;

// CHANGE THIS PREFIX
const char* TOPIC_TELEMETRY = "smartclass/demo01/telemetry";
const char* TOPIC_COMMAND   = "smartclass/demo01/command";
const char* TOPIC_STATUS    = "smartclass/demo01/status";

const int PIR_PIN    = 14;
const int DHT_PIN    = 15;
const int BUZZER_PIN = 25;

// RFID attendance (MFRC522)
// Uses SPI pins mapped away from shift-register + AC indicator GPIOs.
const int RFID_SS_PIN   = 12; // SDA / SS (chip select)
const int RFID_RST_PIN  = 21; // RST
const int RFID_SCK_PIN  = 26; // SCK
const int RFID_MISO_PIN = 13; // MISO
const int RFID_MOSI_PIN = 27; // MOSI

#define LIGHT_TOTAL 10
#define FAN_TOTAL 6

// Two chained 74HC595 shift registers => 16 outputs total.
// Output bit mapping (0..15):
// - 0..9  => 10 white tubelight LEDs (2x5 grid)
// - 10..15 => 6 cyan fan indicator LEDs (2x3 grid)
const int SR_DS_PIN = 16;    // Serial data input
const int SR_SHCP_PIN = 17;  // Shift clock
const int SR_STCP_PIN = 18;  // Latch clock

// AC indicators (visual representation in Wokwi)
const int AC_POWER_LED_PIN   = 19;
const int AC_COOLING_LED_PIN = 23;

#define DHTTYPE DHT22
DHT dhtSensor(DHT_PIN, DHTTYPE);

WiFiClient espClient;
PubSubClient mqttClient(espClient);

MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);

bool autoMode = true;
bool manualLight = false;
bool manualFan = false;
bool forceOff = false;
bool afterHoursAlert = false;

bool occupied = false;
unsigned long lastMotionMs = 0;
unsigned long lastPublishMs = 0;

float tempThreshold = 30.0;
const float FAN_AUTO_THRESHOLD_C = 20.0f;
const float AC_AUTO_START_THRESHOLD_C = 25.0f;

// Telemetry responsiveness tuning.
// Keep telemetry JSON structure unchanged; only adjust when we publish/print.
const unsigned long TELEMETRY_MIN_PUBLISH_INTERVAL_MS = 500;
const unsigned long TELEMETRY_MAX_PUBLISH_INTERVAL_MS = 1000; // safety "heartbeat"
const float TEMP_PUBLISH_EPS_C = 0.1f;

bool telemetryDirty = true;

float lastPublishedTempC = NAN;
bool lastPublishedMotion = false;
bool lastPublishedOccupied = false;
int lastPublishedLightOnCount = -1;
int lastPublishedFanOnCount = -1;
bool lastPublishedAutoMode = true;
bool lastPublishedForceOff = false;
bool lastPublishedAfterHoursAlert = false;
float lastPublishedTempThreshold = 28.0f;
bool lastPublishedAcPower = false;
bool lastPublishedAcModeAuto = true;
bool lastPublishedAcCoolingActive = false;
int lastPublishedManualFanCount = -1;

// Attendance scan → telemetry bridge.
// We queue the last seen tag as an `attendanceEvent` and include it in the next telemetry publish.
String pendingAttendanceTagId = "";
bool attendanceEventPending = false;
String lastAttendanceTagId = "";
unsigned long lastAttendanceEventAtMs = 0;
const unsigned long ATTENDANCE_LOCAL_SUPPRESS_MS = 5000;

// Sample roster tag map (must match backend roster for "valid card" feedback).
// If a scanned UID is not in this table, Wokwi gives "invalid card" feedback and
// backend will classify it as invalid/unknown.
const char* KNOWN_TAG_UIDS[] = {
  "01:02:03:04",             // Blue Card
  "11:22:33:44",             // Green Card
  "55:66:77:88",             // Yellow Card
  "AA:BB:CC:DD",             // Red Card
  "04:11:22:33",             // NFC Tag (Wokwi currently reports 4-byte UID)
  "C0:FF:EE:99",             // Key Fob
};
const int KNOWN_TAG_COUNT = sizeof(KNOWN_TAG_UIDS) / sizeof(KNOWN_TAG_UIDS[0]);

// AC simulation state
bool acPower = true;     // main AC power
bool acModeAuto = true; // true => thermostat logic uses tempThreshold; false => manual AC power controls cooling
bool acCoolingActive = false;
bool acPowerActive = false; // effective AC running state for indicator + telemetry

// Manual per-grid controls (counts). Backward compatible with boolean `light`/`fan` commands.
int manualLightCount = 0; // 0..LIGHT_TOTAL
int manualFanCount = 0;   // 0..FAN_TOTAL

// Cached grid state (driven in applyLogic; published in telemetry)
int lightOnCount = 0;
int fanOnCount = 0;
uint16_t gridOutputMask = 0; // 16-bit mask (0..9 lights, 10..15 fans)

static inline int clampInt(int v, int lo, int hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void publishStatus(const char* text) {
  mqttClient.publish(TOPIC_STATUS, text);
}

bool isKnownAttendanceTag(const String& uid) {
  for (int i = 0; i < KNOWN_TAG_COUNT; i++) {
    if (uid.equalsIgnoreCase(KNOWN_TAG_UIDS[i])) return true;
  }
  return false;
}

void attendanceBeepPattern(const char* pattern) {
  if (strcmp(pattern, "valid") == 0) {
    tone(BUZZER_PIN, 2200, 70);
    delay(90);
    tone(BUZZER_PIN, 2400, 90);
    delay(110);
    noTone(BUZZER_PIN);
    return;
  }
  if (strcmp(pattern, "duplicate") == 0) {
    tone(BUZZER_PIN, 1600, 70);
    delay(90);
    noTone(BUZZER_PIN);
    return;
  }
  // invalid
  tone(BUZZER_PIN, 700, 220);
  delay(240);
  noTone(BUZZER_PIN);
}

// Send 16-bit output mask to two chained 74HC595 chips.
// Bit mapping is documented above (0..9 lights, 10..15 fans).
void writeOutputMask(uint16_t mask) {
  uint8_t low = (uint8_t)(mask & 0xFF);
  uint8_t high = (uint8_t)((mask >> 8) & 0xFF);

  // Latch low, shift two bytes, then latch high.
  digitalWrite(SR_STCP_PIN, LOW);

  // With Q7S chaining, the byte shifted in first ends up at the far chip.
  // We send 'high' first so bits 8..15 land on the second 74HC595.
  shiftOut(SR_DS_PIN, SR_SHCP_PIN, MSBFIRST, high);
  shiftOut(SR_DS_PIN, SR_SHCP_PIN, MSBFIRST, low);

  digitalWrite(SR_STCP_PIN, HIGH);
}

uint16_t buildGridOutputMask(int desiredLightCount, int desiredFanCount) {
  int lc = clampInt(desiredLightCount, 0, LIGHT_TOTAL);
  int fc = clampInt(desiredFanCount, 0, FAN_TOTAL);

  uint16_t out = 0;
  for (int i = 0; i < lc; i++) {
    out |= (uint16_t)(1U << i); // bits 0..9
  }
  for (int j = 0; j < fc; j++) {
    out |= (uint16_t)(1U << (10 + j)); // bits 10..15
  }
  return out;
}

void applyLogic(float tempC, bool motion) {
  if (motion) {
    lastMotionMs = millis();
  }

  occupied = (millis() - lastMotionMs < 20000);

  int desiredLightCount = 0;
  int desiredFanCount = 0;
  bool desiredAcPowerActive = false;
  bool desiredCoolingActive = false;

  if (forceOff) {
    desiredLightCount = 0;
    desiredFanCount = 0;
    desiredAcPowerActive = false;
    desiredCoolingActive = false;
  } else {
    // Lights: preserved semantics from Phase B
    // - auto mode => lights follow occupancy
    // - manual mode => lights follow manualLightCount
    if (autoMode) {
      desiredLightCount = occupied ? LIGHT_TOTAL : 0;
    } else {
      desiredLightCount = manualLightCount;
    }

    // FAN logic (independent from AC):
    // - auto mode => fan follows a dedicated threshold
    // - manual mode => fan follows manualFanCount
    if (autoMode) {
      desiredFanCount = (!isnan(tempC) && tempC >= FAN_AUTO_THRESHOLD_C) ? FAN_TOTAL : 0;
    } else {
      desiredFanCount = clampInt(manualFanCount, 0, FAN_TOTAL);
    }

    // AC logic (independent from FAN):
    // - AC must be power-enabled
    // - in auto mode: AC starts at 25C, cooling starts at tempThreshold (slider)
    // - in manual mode: AC power directly controls cooling
    if (!acPower) {
      desiredAcPowerActive = false;
      desiredCoolingActive = false;
    } else if (acModeAuto) {
      desiredAcPowerActive = (!isnan(tempC) && tempC >= AC_AUTO_START_THRESHOLD_C);
      desiredCoolingActive = (desiredAcPowerActive && !isnan(tempC) && tempC >= tempThreshold);
    } else {
      desiredAcPowerActive = true;
      desiredCoolingActive = true;
    }
  }

  acPowerActive = desiredAcPowerActive;
  acCoolingActive = desiredCoolingActive;
  lightOnCount = desiredLightCount;
  fanOnCount = desiredFanCount;
  gridOutputMask = buildGridOutputMask(lightOnCount, fanOnCount);
  writeOutputMask(gridOutputMask);

  // Visual AC indicators (visual representation of control state)
  digitalWrite(AC_POWER_LED_PIN, acPowerActive ? HIGH : LOW);
  digitalWrite(AC_COOLING_LED_PIN, acCoolingActive ? HIGH : LOW);

  if (afterHoursAlert && motion) {
    tone(BUZZER_PIN, 1000);
  } else {
    noTone(BUZZER_PIN);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.println("Invalid command JSON");
    return;
  }

  if (doc.containsKey("mode")) {
    String mode = doc["mode"].as<String>();
    autoMode = (mode == "auto");
    // Backward compatibility: when system mode switches, keep AC mode aligned unless explicitly overridden.
    acModeAuto = autoMode;
  }

  if (doc.containsKey("light")) {
    // Backward compatible:
    // - boolean light => ON means full grid
    // - numeric light => 0..10 tubelights
    if (doc["light"].is<bool>()) {
      manualLight = doc["light"];
      manualLightCount = manualLight ? LIGHT_TOTAL : 0;
    } else {
      int v = doc["light"].as<int>();
      manualLight = v > 0;
      manualLightCount = clampInt(v, 0, LIGHT_TOTAL);
    }
  }

  if (doc.containsKey("fan")) {
    // Backward compatible:
    // - boolean fan => ON means full fan grid
    // - numeric fan => 0..6 stages
    if (doc["fan"].is<bool>()) {
      manualFan = doc["fan"];
      manualFanCount = manualFan ? FAN_TOTAL : 0;
    } else {
      int v = doc["fan"].as<int>();
      manualFan = v > 0;
      manualFanCount = clampInt(v, 0, FAN_TOTAL);
    }
  }

  if (doc.containsKey("forceOff")) {
    forceOff = doc["forceOff"];
  }

  if (doc.containsKey("afterHoursAlert")) {
    afterHoursAlert = doc["afterHoursAlert"];
  }

  if (doc.containsKey("tempThreshold")) {
    tempThreshold = doc["tempThreshold"];
  }

  // Phase 1 additions: AC control
  if (doc.containsKey("acPower")) {
    acPower = doc["acPower"];
  }

  if (doc.containsKey("acMode")) {
    String m = doc["acMode"].as<String>();
    acModeAuto = (m == "auto");
  }

  if (doc.containsKey("acSetpoint")) {
    // acSetpoint maps 1:1 to the existing tempThreshold cooling comparator
    tempThreshold = doc["acSetpoint"];
  }

  publishStatus("Command received");
  telemetryDirty = true; // commands can change published device/control state
}

void connectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected()) {
    attempts++;
    Serial.print("MQTT connect attempt ");
    Serial.print(attempts);
    Serial.print(" broker=");
    Serial.println(MQTT_BROKER);

    String clientId = "smartclass-esp32-" + String(random(1000, 9999));
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("MQTT connected");
      mqttClient.subscribe(TOPIC_COMMAND);
      publishStatus("ESP32 connected");
      return;
    }

    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqttClient.state());
    delay(2000);
  }
}

void pollRfidAttendance() {
  // MFRC522 uses internal SPI; keep this lightweight (called frequently).
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    byte b = rfid.uid.uidByte[i];
    if (b < 0x10) uid += "0";
    uid += String(b, HEX);
    if (i + 1 < rfid.uid.size) uid += ":";
  }
  uid.toUpperCase();

  unsigned long nowMs = millis();
  bool shouldQueue =
      (uid != lastAttendanceTagId) || (nowMs - lastAttendanceEventAtMs >= ATTENDANCE_LOCAL_SUPPRESS_MS);
  bool knownTag = isKnownAttendanceTag(uid);

  lastAttendanceTagId = uid;
  if (shouldQueue) {
    pendingAttendanceTagId = uid;
    attendanceEventPending = true;
    telemetryDirty = true; // ensure telemetry is published soon with the attendance event
    lastAttendanceEventAtMs = nowMs;
    Serial.print("RFID queued tagId=");
    Serial.print(uid);
    if (knownTag) {
      Serial.println(" (known card; backend will mark present/late)");
      attendanceBeepPattern("valid");
    } else {
      Serial.println(" (unknown card; backend will mark invalid)");
      attendanceBeepPattern("invalid");
    }
  } else {
    Serial.print("RFID duplicate suppressed tagId=");
    Serial.println(uid);
    attendanceBeepPattern("duplicate");
  }

  // Stop PICC so the next scan triggers cleanly.
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

void publishTelemetry(float tempC, bool motion) {
  // Telemetry JSON now includes lights/fans counts+bitmasks and AC state.
  // 1024 keeps serialization safe under ArduinoJson's sizing rules.
  StaticJsonDocument<1024> doc;

  doc["temperature"] = isnan(tempC) ? -999 : tempC;
  doc["motion"] = motion;
  doc["occupied"] = occupied;
  // Backward compatible 0/1 semantics: 1 when any device is on.
  doc["light"] = (lightOnCount > 0) ? 1 : 0;
  doc["fan"] = (fanOnCount > 0) ? 1 : 0;
  doc["mode"] = autoMode ? "auto" : "manual";
  doc["forceOff"] = forceOff;
  doc["afterHoursAlert"] = afterHoursAlert;
  doc["tempThreshold"] = tempThreshold;

  // Phase 1 expanded telemetry (grid + AC state)
  doc["lightOnCount"] = lightOnCount;
  doc["lightTotal"] = LIGHT_TOTAL;
  doc["fanOnCount"] = fanOnCount;
  doc["fanTotal"] = FAN_TOTAL;

  doc["lightsMask"] = (uint16_t)(gridOutputMask & 0x03FF); // 10 bits
  doc["fansMask"] = (uint8_t)((gridOutputMask >> 10) & 0x3F); // 6 bits

  doc["acPower"] = acPowerActive;
  doc["acMode"] = acModeAuto ? "auto" : "manual";
  doc["acSetpoint"] = tempThreshold;
  doc["acCoolingActive"] = acCoolingActive;
  doc["acManualOverride"] = (!acModeAuto && acPowerActive);

  // Attendance event (embedded in telemetry)
  if (attendanceEventPending && pendingAttendanceTagId.length() > 0) {
    JsonObject ev = doc.createNestedObject("attendanceEvent");
    ev["tagId"] = pendingAttendanceTagId;
    ev["eventType"] = "present";
    attendanceEventPending = false; // one-shot event
  } else {
    doc["attendanceEvent"] = nullptr;
  }

  // Bigger buffer because telemetry JSON grew (lights/fans counts + AC fields).
  char buffer[1024];
  serializeJson(doc, buffer);

  // If MQTT isn't connected, publishing silently fails; log occasionally.
  static unsigned long lastNoMqttPrintMs = 0;
  if (mqttClient.connected()) {
    bool ok = mqttClient.publish(TOPIC_TELEMETRY, buffer);
    Serial.print("MQTT publish to ");
    Serial.print(TOPIC_TELEMETRY);
    Serial.print(" ok=");
    Serial.println(ok ? "true" : "false");
  } else {
    unsigned long nowMs = millis();
    if (nowMs - lastNoMqttPrintMs > 10000) {
      Serial.println("MQTT not connected; telemetry publish skipped");
      lastNoMqttPrintMs = nowMs;
    }
  }

  Serial.println(buffer);
}

bool shouldPublishTelemetryNow(float tempC, bool motion, unsigned long nowMs) {
  // First sample quickly after boot.
  if (lastPublishMs == 0) return true;

  // Prevent flooding Serial/MQTT.
  if (nowMs - lastPublishMs < TELEMETRY_MIN_PUBLISH_INTERVAL_MS) return false;

  // Attendance event should not wait.
  if (attendanceEventPending && pendingAttendanceTagId.length() > 0) return true;

  if (telemetryDirty) return true;

  bool tempChanged = false;
  if (isnan(tempC) && isnan(lastPublishedTempC)) {
    tempChanged = false;
  } else if (isnan(tempC) != isnan(lastPublishedTempC)) {
    tempChanged = true;
  } else {
    tempChanged = fabs(tempC - lastPublishedTempC) >= TEMP_PUBLISH_EPS_C;
  }
  if (tempChanged) return true;
  if (motion != lastPublishedMotion) return true;
  if (occupied != lastPublishedOccupied) return true;
  if (lightOnCount != lastPublishedLightOnCount) return true;
  if (fanOnCount != lastPublishedFanOnCount) return true;
  if (autoMode != lastPublishedAutoMode) return true;
  if (forceOff != lastPublishedForceOff) return true;
  if (afterHoursAlert != lastPublishedAfterHoursAlert) return true;
  if (fabs(tempThreshold - lastPublishedTempThreshold) >= 0.05f) return true;
  if (acPowerActive != lastPublishedAcPower) return true;
  if (acModeAuto != lastPublishedAcModeAuto) return true;
  if (acCoolingActive != lastPublishedAcCoolingActive) return true;
  if (manualFanCount != lastPublishedManualFanCount) return true;

  // Safety "heartbeat" so dashboards stay alive even if only minor changes happen.
  if (nowMs - lastPublishMs >= TELEMETRY_MAX_PUBLISH_INTERVAL_MS) return true;
  return false;
}

void setup() {
  // Higher baud makes Serial monitor output noticeably snappier.
  Serial.begin(230400);

  pinMode(PIR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  pinMode(SR_DS_PIN, OUTPUT);
  pinMode(SR_SHCP_PIN, OUTPUT);
  pinMode(SR_STCP_PIN, OUTPUT);

  pinMode(AC_POWER_LED_PIN, OUTPUT);
  pinMode(AC_COOLING_LED_PIN, OUTPUT);

  digitalWrite(SR_DS_PIN, LOW);
  digitalWrite(SR_SHCP_PIN, LOW);
  digitalWrite(SR_STCP_PIN, LOW);

  // Default AC indicators and grid output states
  acPowerActive = false;
  digitalWrite(AC_POWER_LED_PIN, LOW);
  digitalWrite(AC_COOLING_LED_PIN, LOW);

  lightOnCount = 0;
  fanOnCount = 0;
  acCoolingActive = false;
  gridOutputMask = 0;
  writeOutputMask(0);

  noTone(BUZZER_PIN);

  dhtSensor.begin();

  // RFID init
  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN, RFID_SS_PIN);
  rfid.PCD_Init();
  Serial.println("RFID ready");

  connectWiFi();
  // PubSubClient has an internal packet buffer limit; our telemetry JSON is larger now.
  // Increase it so mqttClient.publish() doesn't fail silently.
  mqttClient.setBufferSize(2048);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  float tempC = dhtSensor.readTemperature();
  bool motion = digitalRead(PIR_PIN);

  applyLogic(tempC, motion);
  pollRfidAttendance();

  unsigned long nowMs = millis();
  if (shouldPublishTelemetryNow(tempC, motion, nowMs)) {
    publishTelemetry(tempC, motion);
    lastPublishMs = nowMs;

    // Snapshot state to detect "meaningful changes" next time.
    lastPublishedTempC = tempC;
    lastPublishedMotion = motion;
    lastPublishedOccupied = occupied;
    lastPublishedLightOnCount = lightOnCount;
    lastPublishedFanOnCount = fanOnCount;
    lastPublishedAutoMode = autoMode;
    lastPublishedForceOff = forceOff;
    lastPublishedAfterHoursAlert = afterHoursAlert;
    lastPublishedTempThreshold = tempThreshold;
    lastPublishedAcPower = acPowerActive;
    lastPublishedAcModeAuto = acModeAuto;
    lastPublishedAcCoolingActive = acCoolingActive;
    lastPublishedManualFanCount = manualFanCount;
    telemetryDirty = false;
  }

  // Small non-blocking delay to keep Wi-Fi/MQTT responsive in simulation.
  delay(50);
}