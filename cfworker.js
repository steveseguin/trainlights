// wrangler.toml configuration:
// [vars]
// LIFX_API_TOKEN = "your-api-token-here"
//
// To deploy:
// 1. Install wrangler: npm install -g wrangler
// 2. Login: wrangler login
// 3. Deploy: wrangler deploy

export default {
  async fetch(request, env, ctx) {
    // CORS headers to allow requests from any origin
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Only allow specific paths to avoid abuse
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Route format: /api/lifx/{lightId}/{state}
    if (pathParts[0] === 'api' && pathParts[1] === 'lifx' && pathParts.length === 4) {
      const lightId = pathParts[2];
      const state = pathParts[3];
      
      // Validate state parameter
      if (state !== 'on' && state !== 'off') {
        return new Response(JSON.stringify({ error: 'Invalid state. Use "on" or "off".' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      try {
        // Call LIFX API
        const lifxUrl = `https://api.lifx.com/v1/lights/id:${lightId}/state`;
        const response = await fetch(lifxUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${env.LIFX_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            power: state
          })
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
          return new Response(JSON.stringify({ 
            success: true,
            message: `LIFX light ${lightId} turned ${state}`,
            data: responseData
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ 
            error: 'LIFX API error',
            details: responseData
          }), {
            status: response.status,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }
    
    // Return 404 for any other routes
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
