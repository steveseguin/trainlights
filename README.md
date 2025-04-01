# LIFX Train Room Controller

A lightweight solution for controlling LIFX smart lights from a web interface, designed specifically for model train enthusiasts who want to integrate lighting control with their train simulation setup.

## Features

- Control LIFX lights directly from a web browser
- Secure API key handling via Cloudflare Workers
- Automatic light timer functionality
- Integration examples for train simulation sensors
- Simple interface with status logging

## Architecture

This project consists of three main components:

1. **Cloudflare Worker** - A serverless function that securely handles API requests to LIFX
2. **Frontend JavaScript** - Browser code to interface with the Cloudflare Worker
3. **HTML Interface** - A simple control panel for your train room lights

## Setup Instructions

### 1. Set Up Your LIFX API Token

1. Go to [LIFX Cloud Settings](https://cloud.lifx.com/settings)
2. Navigate to the Developer section
3. Generate a new token with "All Scopes" permissions
4. Copy your token for the next steps

### 2. Deploy the Cloudflare Worker

1. Create a Cloudflare account if you don't have one
2. Install Wrangler CLI:
   ```
   npm install -g wrangler
   ```
3. Login to your Cloudflare account:
   ```
   wrangler login
   ```
4. Create a new worker project:
   ```
   wrangler init lifx-train-controller
   ```
5. Replace the contents of `src/index.js` with the provided Cloudflare Worker code
6. Set your API token as a secret:
   ```
   wrangler secret put LIFX_API_TOKEN
   ```
7. Deploy the worker:
   ```
   wrangler publish
   ```
8. Note your worker URL (e.g., `https://lifx-train-controller.your-username.workers.dev`)

### 3. Set Up the Frontend

1. Create a new directory for your project
2. Create an `app.js` file with the provided frontend JavaScript code
3. Update the `WORKER_URL` constant with your Cloudflare Worker URL
4. Update the `LIFX_LIGHT_ID` with your LIFX light ID
5. Create an `index.html` file with the provided HTML code
6. Host the files on your preferred web server or hosting service

## Usage

### Basic Controls

- **Activate Sensor X**: Simulates a train sensor activation, turning on the light and playing a sound
- **Light On (15min Timer)**: Turns the light on for 15 minutes, then automatically turns it off
- **Light On/Off**: Simple manual controls for the light

### Integration with Train Simulation

This system can integrate with your existing train simulation by:

1. Calling the `handleSensorActivated()` function when virtual sensors are triggered
2. Implementing the `updateSignalMast()` function to communicate with your train control system
3. Customizing sound effects for different train events

## Customization

### Light Settings

You can modify the light settings by changing the payload in the Cloudflare Worker:

```javascript
body: JSON.stringify({
  power: state,
  brightness: 0.8,     // 0.0 to 1.0
  color: "blue",       // Add color control
  duration: 1.5        // Transition time in seconds
})
```

### Adding More Lights

To control multiple lights, modify the frontend code to accept different light IDs:

```javascript
function controlMultipleLights(lightIds, state) {
  const promises = lightIds.map(id => controlLifxLight(id, state));
  return Promise.all(promises);
}
```

## Troubleshooting

### Authorization Issues

If you see "Invalid credentials" errors:
- Generate a new LIFX API token
- Update your Cloudflare Worker secret

### CORS Problems

If you encounter CORS issues:
- Ensure your Cloudflare Worker has the proper CORS headers
- Check that your frontend is using the correct fetch mode

## License

MIT

## Acknowledgements

- LIFX for their API
- Cloudflare for their Workers platform
