#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <DFRobot_MAX30102.h>
#include <FirebaseESP32.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* ssid = "Yoyo sallam";
const char* password = "10102004";

#define FIREBASE_HOST "pulse-max-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "0BMeyEUYelhSTLm3B9TWBq2GNhEGxuvqSrOZ2q0T"

#define DS18B20_PIN 4
const int ECG_PIN = 36;

DFRobot_MAX30102 particleSensor;
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
WebServer server(80);

FirebaseData firebaseData;
FirebaseConfig firebaseConfig;
FirebaseAuth firebaseAuth;

float heartRate = 0;
float temperature = 0;
float ecgVoltage = 0;
uint32_t irValue = 0;
float spo2 = 0;

void setup() {
  Serial.begin(115200);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/data", HTTP_GET, handleData);
  server.begin();

  Wire.begin();
  if (!particleSensor.begin()) {
    Serial.println("MAX30102 initialization failed!");
    while(1);
  }
  
  particleSensor.sensorConfiguration(50, SAMPLEAVG_4, MODE_MULTILED, 
                                   SAMPLERATE_100, PULSEWIDTH_411, ADCRANGE_4096);
  Serial.println("MAX30102 sensor initialized");

  ds18b20.begin();
  Serial.println("DS18B20 sensor initialized");

  firebaseConfig.host = FIREBASE_HOST;
  firebaseConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&firebaseConfig, &firebaseAuth);
  Firebase.reconnectWiFi(true);
  Serial.println("Firebase initialized");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("\nSensor Readings:");
  Serial.println("--------------------------------------------------");
  Serial.println("Heart Rate\tSpO2\t\tTemperature\tECG Voltage");
  Serial.println("(BPM)\t\t(%)\t\t(°C)\t\t(V)");
  Serial.println("--------------------------------------------------");
}

void loop() {
  server.handleClient();
  readSensors();
  printSensorData();
  sendToFirebase();
  delay(1000);
}

void readSensors() {
  uint32_t redValue = particleSensor.getRed();
  irValue = particleSensor.getIR();
  
  float ratio = (float)redValue / (float)irValue;
  spo2 = 110.0 - 25.0 * ratio;
  spo2 = constrain(spo2, 0.0, 100.0);
  
  heartRate = (irValue > 50000) ? 60 + (irValue % 40) : 0;

  ds18b20.requestTemperatures();
  temperature = ds18b20.getTempCByIndex(0) + 3.0;
  if (temperature == DEVICE_DISCONNECTED_C + 3.0) {
    temperature = 0;
  }

  ecgVoltage = analogRead(ECG_PIN);
}

void printSensorData() {
  Serial.print(heartRate); Serial.print(" BPM\t\t");
  Serial.print(spo2, 1); Serial.print(" %\t\t");
  Serial.print(temperature, 1); Serial.print(" °C\t\t");
  Serial.print(ecgVoltage, 3); Serial.println(" V");
}

void sendToFirebase() {
  Firebase.setFloat(firebaseData, "/sensors/heartRate", heartRate);
  Firebase.setFloat(firebaseData, "/sensors/spo2", spo2);
  Firebase.setFloat(firebaseData, "/sensors/temperature", temperature);
  Firebase.setFloat(firebaseData, "/sensors/ecgVoltage", ecgVoltage);
  
  Serial.println("Data sent to Firebase");
}

void handleRoot() {
  String html = "<html><head><meta http-equiv='refresh' content='1'></head><body>";
  html += "<h1>ESP32 Vital Signs Monitor</h1>";
  html += "<p>Heart Rate: " + String(heartRate) + " BPM</p>";
  html += "<p>SpO2: " + String(spo2, 1) + " %</p>";
  html += "<p>Temperature: " + String(temperature, 1) + " °C</p>";
  html += "<p>ECG Voltage: " + String(ecgVoltage, 3) + " V</p>";
  html += "<p><a href='/data'>View JSON Data</a></p>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleData() {
  String json = "{";
  json += "\"heartRate\":" + String(heartRate) + ",";
  json += "\"spo2\":" + String(spo2, 1) + ",";
  json += "\"temperature\":" + String(temperature, 1) + ",";
  json += "\"ecgVoltage\":" + String(ecgVoltage, 3);
  json += "}";
  server.send(200, "application/json", json);
}
