from flask import Flask, request, jsonify, render_template
import torch
import torch.nn as nn
import joblib
import numpy as np
import firebase_admin
from firebase_admin import credentials, db
import threading
import time

app = Flask(__name__, static_url_path='', static_folder='static', template_folder='templates')

class SuperHealthModel(nn.Module):
    def __init__(self):
        super(SuperHealthModel, self).__init__()
        self.fc1 = nn.Linear(4, 128)
        self.bn1 = nn.BatchNorm1d(128)
        self.fc2 = nn.Linear(128, 64)
        self.bn2 = nn.BatchNorm1d(64)
        self.fc3 = nn.Linear(64, 32)
        self.bn3 = nn.BatchNorm1d(32)
        self.fc4 = nn.Linear(32, 4)
        self.dropout = nn.Dropout(0.5)

    def forward(self, x):
        x = torch.relu(self.bn1(self.fc1(x)))
        x = self.dropout(x)
        x = torch.relu(self.bn2(self.fc2(x)))
        x = self.dropout(x)
        x = torch.relu(self.bn3(self.fc3(x)))
        x = self.fc4(x)
        return x

model = SuperHealthModel()
model.load_state_dict(torch.load('health_super_model.pt', map_location=torch.device('cpu')))
model.eval()
scaler = joblib.load('scaler.pkl')

class_map = ['Critical', 'Normal', 'Risk', 'Warning']
cred = credentials.Certificate('firebase_keys.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://cardc-969a0-default-rtdb.firebaseio.com/'
})

# Global variables to store latest data and prediction
latest_data = None
latest_prediction = None
latest_confidence = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        required_fields = ['Temperature', 'ECG', 'SpO2', 'BPM']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        features = np.array([
            data['Temperature'],
            data['ECG'],
            data['SpO2'],
            data['BPM']
        ]).reshape(1, -1)

        scaled = scaler.transform(features)
        tensor_input = torch.tensor(scaled, dtype=torch.float32)

        with torch.no_grad():
            output = model(tensor_input)
            probabilities = torch.softmax(output, dim=1)
            confidence, predicted = torch.max(probabilities, 1)
            prediction = class_map[predicted.item()]

        return jsonify({
            'prediction': prediction,
            'confidence': float(confidence.item()),
            'status': 'success'
        })

    except Exception as e:
        return jsonify({'error': str(e), 'status': 'error'}), 500

@app.route('/latest-data', methods=['GET'])
def get_latest_data():
    """Endpoint to get the latest data and prediction"""
    global latest_data, latest_prediction, latest_confidence
    
    if latest_data is None:
        return jsonify({'status': 'error', 'message': 'No data available yet'}), 404
        
    return jsonify({
        'data': latest_data,
        'prediction': latest_prediction,
        'confidence': latest_confidence,
        'status': 'success'
    })

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

def fetch_and_predict():
    global latest_data, latest_prediction, latest_confidence
    parent_ref = db.reference('sensors')

    while True:
        try:
            data = parent_ref.get()
            if data:
                # Update the latest data
                latest_data = {
                    'Temperature': data['Temperature'],
                    'ECG': data['ECG'],
                    'SpO2': data['SpO2'],
                    'BPM': data['BPM']
                }
                
                features = np.array([
                    data['Temperature'],
                    data['ECG'],
                    data['SpO2'],
                    data['BPM']
                ]).reshape(1, -1)

                scaled = scaler.transform(features)
                tensor_input = torch.tensor(scaled, dtype=torch.float32)

                with torch.no_grad():
                    output = model(tensor_input)
                    probabilities = torch.softmax(output, dim=1)
                    confidence, predicted = torch.max(probabilities, 1)
                    prediction = class_map[predicted.item()]
                
                # Update the latest prediction and confidence
                latest_prediction = prediction
                latest_confidence = float(confidence.item())
                
                print(f"[PREDICTION] {prediction} (Confidence: {float(confidence.item()):.2f})")
                print(f"[DATA] Temperature: {data['Temperature']}, ECG: {data['ECG']}, SpO2: {data['SpO2']}, BPM: {data['BPM']}")
            else:
                print("[INFO] No data found in Firebase.")

        except Exception as e:
            print(f"[ERROR] {e}")

        time.sleep(5)  # Check every 5 seconds for new data

if __name__ == '__main__':
    threading.Thread(target=fetch_and_predict, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=False)