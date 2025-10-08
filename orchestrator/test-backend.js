const axios = require('axios');

async function testBackend() {
  const baseURL = 'http://localhost:15000'; // Docker port
  
  console.log('Testing backend connection...');
  
  try {
    // Test health endpoint
    const healthResponse = await axios.get(`${baseURL}/health`);
    console.log('✅ Health check:', healthResponse.data);
    
    // Test login
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    console.log('✅ Login successful:', loginResponse.data.success);
    
    const token = loginResponse.data.token;
    
    // Test instances endpoint
    const instancesResponse = await axios.get(`${baseURL}/api/instances`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Instances endpoint:', instancesResponse.data.length, 'instances');
    
    // Test templates endpoint
    const templatesResponse = await axios.get(`${baseURL}/api/templates`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Templates endpoint:', templatesResponse.data.length, 'templates');
    
    // Test port range endpoint
    const portRangeResponse = await axios.get(`${baseURL}/api/instances/port-range`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Port range:', portRangeResponse.data.message);
    
    // Test session endpoints (if there are instances)
    if (instancesResponse.data.length > 0) {
      const instanceId = instancesResponse.data[0].id;
      
      try {
        const sessionsResponse = await axios.get(`${baseURL}/api/instances/${instanceId}/sessions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Sessions endpoint:', sessionsResponse.data.sessions?.length || 0, 'sessions');
        
        // Test resources endpoint
        const resourcesResponse = await axios.get(`${baseURL}/api/instances/${instanceId}/resources`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Resources endpoint: CPU:', resourcesResponse.data.cpu + '%', 'Memory:', resourcesResponse.data.memory + '%');
        
        // Test session endpoints if there are sessions
        if (sessionsResponse.data.sessions?.length > 0) {
          const sessionId = sessionsResponse.data.sessions[0].id;
          
          try {
            const classInfoResponse = await axios.get(`${baseURL}/api/instances/${instanceId}/session-class-info/${sessionId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            console.log('✅ Session class info endpoint working');
          } catch (classInfoError) {
            console.log('ℹ️ Session class info:', classInfoError.response?.data?.error || 'Not available');
          }
          
          try {
            const qrResponse = await axios.get(`${baseURL}/api/instances/${instanceId}/session-qr/${sessionId}`, {
              headers: { Authorization: `Bearer ${token}` },
              responseType: 'arraybuffer'
            });
            console.log('✅ Session QR code endpoint working');
          } catch (qrError) {
            console.log('ℹ️ Session QR code:', qrError.response?.data?.error || 'Not available');
          }
        }
        
      } catch (sessionError) {
        console.log('ℹ️ Sessions/Resources endpoints: No sessions or instance not running');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testBackend();