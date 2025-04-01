// LIFX light ID
const LIFX_LIGHT_ID = "d073d56b8996"; // Lifx Train Room

// Cloudflare Worker URL - replace with your actual deployed worker URL
const WORKER_URL = "https://railtrain.vdo.workers.dev";

// Function to control LIFX light through Cloudflare Worker
function controlLifxLight(state) {
  const url = `${WORKER_URL}/api/lifx/${LIFX_LIGHT_ID}/${state}`;
  
  return fetch(url, {
    method: 'POST'
  })
  .then(response => {
    if (response.ok) {
      console.log(`LIFX light turned ${state}`);
      return response.json();
    } else {
      console.error(`Failed to change LIFX light state: ${response.status}`);
      return response.text().then(text => {
        throw new Error(text);
      });
    }
  });
}

// Example handler functions that could be connected to UI elements or sensor events
function handleSensorActivated(sensorId) {
  console.log(`Sensor ${sensorId} activated`);
  
  // Turn on the light
  controlLifxLight("on")
    .then(() => {
      console.log("Light turned on");
      
      // Play sound if needed
      const sound = new Audio('resources/sounds/Crossing.wav');
      sound.play();
      
      // Set timeout to perform additional actions after 5 seconds
      setTimeout(() => {
        console.log("Waiting 5 seconds.");
        // Change signal mast (implementation depends on your train system API)
        updateSignalMast("SM13 WB TRACK5", "Stop");
      }, 5000);
    })
    .catch(error => {
      console.error("Error controlling light:", error);
    });
}

// Example function to update a signal mast (implementation depends on your train control system)
function updateSignalMast(mastId, aspect) {
  console.log(`Setting Signal Mast ${mastId} to ${aspect}`);
  // This would need to call your train control system's API
}

// Function to auto-turn off the light after a specified duration
function turnOnLightWithTimer(duration = 15) {
  controlLifxLight("on")
    .then(() => {
      console.log(`Light turned on for ${duration} minutes`);
      
      // Set timeout to turn off the light
      setTimeout(() => {
        controlLifxLight("off")
          .then(() => console.log("Light turned off automatically"))
          .catch(error => console.error("Error turning off light:", error));
      }, duration * 60 * 1000); // Convert minutes to milliseconds
    })
    .catch(error => {
      console.error("Error turning on light:", error);
    });
}

// Example of connecting this to UI buttons
function setupEventListeners() {
  // Attach to buttons or other UI elements
  const sensor55Button = document.getElementById('sensor55');
  if (sensor55Button) {
    sensor55Button.addEventListener('click', () => handleSensorActivated('55'));
  }
  
  const sensor56Button = document.getElementById('sensor56');
  if (sensor56Button) {
    sensor56Button.addEventListener('click', () => handleSensorActivated('56'));
  }
  
  const timerButton = document.getElementById('timerLight');
  if (timerButton) {
    timerButton.addEventListener('click', () => turnOnLightWithTimer(15));
  }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', setupEventListeners);
