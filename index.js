import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers
} from '@whiskeysockets/baileys';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PORT must be defined BEFORE it's used in templates
const PORT = process.env.PORT || 3001;

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let sock = null;
let connectionStatus = 'disconnected';
let pairingCode = null;
let connectedPhone = null;
let lastConnectionUpdate = new Date();
let activityLogs = ['> Bot server started'];

// Ensure auth directory exists
const authDir = './auth_session';
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// Function to add activity log
function addActivityLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  activityLogs.push(`> [${timestamp}] ${message}`);
  // Keep only last 50 logs
  if (activityLogs.length > 50) {
    activityLogs = activityLogs.slice(-50);
  }
}

// Root endpoint with dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Edison WhatsApp Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
          color: #333;
        }
        .container {
          max-width: 1000px;
          margin: 0 auto;
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          padding: 40px;
          text-align: center;
        }
        .header h1 {
          font-size: 2.5rem;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
        }
        .header .status {
          display: inline-block;
          padding: 8px 20px;
          background: rgba(255,255,255,0.2);
          border-radius: 50px;
          font-size: 0.9rem;
          margin-top: 10px;
        }
        .content {
          padding: 40px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin-top: 30px;
        }
        .card {
          background: #f8fafc;
          border-radius: 15px;
          padding: 30px;
          border: 1px solid #e2e8f0;
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .card h3 {
          color: #4f46e5;
          margin-bottom: 20px;
          font-size: 1.3rem;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .card h3 i { font-size: 1.5rem; }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #475569;
        }
        input {
          width: 100%;
          padding: 12px 15px;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 1rem;
          transition: border-color 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #4f46e5;
        }
        button {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.3s, box-shadow 0.3s;
          width: 100%;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(79, 70, 229, 0.4);
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .code-display {
          font-family: 'Courier New', monospace;
          font-size: 2.5rem;
          font-weight: bold;
          color: #4f46e5;
          text-align: center;
          letter-spacing: 10px;
          background: #f1f5f9;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          border: 2px dashed #cbd5e1;
        }
        .instructions {
          background: #f0f9ff;
          border-left: 4px solid #0ea5e9;
          padding: 20px;
          border-radius: 8px;
          margin-top: 20px;
        }
        .instructions ol {
          margin-left: 20px;
          margin-top: 10px;
        }
        .instructions li {
          margin-bottom: 10px;
        }
        .endpoints {
          background: #fefce8;
          border-left: 4px solid #f59e0b;
          padding: 20px;
          border-radius: 8px;
          margin-top: 20px;
        }
        .endpoint-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #fde68a;
        }
        .endpoint-method {
          padding: 4px 12px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8rem;
        }
        .get { background: #d1fae5; color: #065f46; }
        .post { background: #dbeafe; color: #1e40af; }
        .response {
          margin-top: 20px;
          padding: 15px;
          border-radius: 10px;
          display: none;
        }
        .success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .status-connected { background: #10b981; }
        .status-disconnected { background: #ef4444; }
        .status-pairing { background: #f59e0b; }
        .status-reconnecting { background: #8b5cf6; }
        .refresh-btn {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          margin-left: 10px;
          font-size: 0.9rem;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 0.9rem;
        }
      </style>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1><i class="fas fa-robot"></i> Edison WhatsApp Bot</h1>
          <div class="status" id="statusDisplay">
            <span class="status-indicator status-${connectionStatus}"></span>
            Status: ${connectionStatus.toUpperCase()}
            ${connectedPhone ? `<br><small>Connected to: ${connectedPhone}</small>` : ''}
          </div>
        </div>
        
        <div class="content">
          <div class="grid">
            <!-- Pairing Card -->
            <div class="card">
              <h3><i class="fas fa-link"></i> Pair with WhatsApp</h3>
              <form id="pairForm">
                <div class="form-group">
                  <label for="phoneNumber"><i class="fas fa-phone"></i> Phone Number</label>
                  <input type="text" id="phoneNumber" 
                         placeholder="Enter phone number (e.g., 1234567890)" 
                         required
                         pattern="[0-9]{10,15}">
                  <small>Include country code without + sign</small>
                </div>
                <button type="submit" id="pairBtn">
                  <i class="fas fa-qrcode"></i> Generate Pairing Code
                </button>
              </form>
              
              <div id="codeResult" style="display: none;">
                <div class="code-display" id="pairingCodeDisplay"></div>
                <div class="instructions">
                  <p><strong>How to pair:</strong></p>
                  <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Go to <strong>Settings → Linked Devices</strong></li>
                    <li>Tap on <strong>Link a Device</strong></li>
                    <li>Select <strong>Link with phone number</strong></li>
                    <li>Enter the code shown above</li>
                  </ol>
                </div>
              </div>
              
              <div class="response" id="pairResponse"></div>
            </div>
            
            <!-- Status & Control Card -->
            <div class="card">
              <h3><i class="fas fa-sliders-h"></i> Bot Control</h3>
              <div style="text-align: center; margin-bottom: 25px;">
                <div style="font-size: 2rem; color: #4f46e5; margin-bottom: 10px;" id="statusIcon">
                  ${connectionStatus === 'connected' ? 
                    '<i class="fas fa-check-circle"></i>' : 
                    '<i class="fas fa-plug"></i>'}
                </div>
                <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 10px;" id="statusText">
                  ${connectionStatus === 'connected' ? 'Bot is Active' : 
                    connectionStatus === 'pairing' ? 'Waiting for Pairing' :
                    'Ready to Connect'}
                </div>
                <div style="color: #64748b; font-size: 0.9rem;" id="lastUpdate">
                  Last update: ${lastConnectionUpdate.toLocaleTimeString()}
                </div>
              </div>
              
              <div style="display: flex; gap: 10px;">
                <button onclick="checkStatus()" style="background: #3b82f6;">
                  <i class="fas fa-sync-alt"></i> Refresh Status
                </button>
                ${connectionStatus === 'connected' ? `
                  <button onclick="disconnectBot()" style="background: #ef4444;">
                    <i class="fas fa-sign-out-alt"></i> Disconnect
                  </button>
                ` : ''}
              </div>
              
              <div class="endpoints" style="margin-top: 25px;">
                <h4><i class="fas fa-code"></i> API Endpoints</h4>
                <div class="endpoint-item">
                  <span><i class="fas fa-heartbeat"></i> Health Check</span>
                  <span class="endpoint-method get">GET</span>
                  <code>/health</code>
                </div>
                <div class="endpoint-item">
                  <span><i class="fas fa-info-circle"></i> Bot Status</span>
                  <span class="endpoint-method get">GET</span>
                  <code>/status</code>
                </div>
                <div class="endpoint-item">
                  <span><i class="fas fa-link"></i> Pair Device</span>
                  <span class="endpoint-method post">POST</span>
                  <code>/pair</code>
                </div>
                <div class="endpoint-item">
                  <span><i class="fas fa-unlink"></i> Disconnect</span>
                  <span class="endpoint-method post">POST</span>
                  <code>/disconnect</code>
                </div>
                <div class="endpoint-item">
                  <span><i class="fas fa-comment"></i> Send Message</span>
                  <span class="endpoint-method post">POST</span>
                  <code>/send</code>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Logs Section -->
          <div class="card" style="margin-top: 30px;">
            <h3><i class="fas fa-terminal"></i> Recent Activity</h3>
            <div id="activityLogs" style="
              background: #0f172a;
              color: #94a3b8;
              padding: 20px;
              border-radius: 10px;
              font-family: 'Courier New', monospace;
              height: 200px;
              overflow-y: auto;
              font-size: 0.9rem;
            ">
              ${activityLogs.map(log => `<div>${log}</div>`).join('')}
            </div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
              <button onclick="clearLogs()" style="background: #64748b;">
                <i class="fas fa-trash"></i> Clear Logs
              </button>
              <button onclick="refreshLogs()" style="background: #3b82f6;">
                <i class="fas fa-sync"></i> Refresh Logs
              </button>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p><i class="fas fa-code"></i> Powered by otedison | v1.0.0</p>
          <p style="margin-top: 5px; font-size: 0.8rem;">
            <i class="fas fa-clock"></i> Server Time: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>

      <script>
        let pollingInterval;
        
        // Poll for status updates
        function startPolling() {
          if (pollingInterval) clearInterval(pollingInterval);
          pollingInterval = setInterval(checkStatus, 3000);
        }
        
        async function checkStatus() {
          try {
            const response = await fetch('/status');
            const data = await response.json();
            
            // Update status display
            updateStatusDisplay(data);
            
            // Update footer time
            document.querySelector('.footer p:nth-child(2)').innerHTML = 
              \`<i class="fas fa-clock"></i> Server Time: \${new Date().toLocaleString()}\`;
              
          } catch (error) {
            console.error('Status check failed:', error);
          }
        }
        
        function updateStatusDisplay(data) {
          const indicator = document.querySelector('.status-indicator');
          const statusDisplay = document.getElementById('statusDisplay');
          const statusIcon = document.getElementById('statusIcon');
          const statusText = document.getElementById('statusText');
          const lastUpdate = document.getElementById('lastUpdate');
          
          // Update classes
          indicator.className = 'status-indicator status-' + data.status;
          
          // Update status display
          statusDisplay.innerHTML = \`
            <span class="status-indicator status-\${data.status}"></span>
            Status: \${data.status.toUpperCase()}
            \${data.phone ? \`<br><small>Connected to: \${data.phone}</small>\` : ''}
          \`;
          
          // Update icon and text
          statusIcon.innerHTML = data.status === 'connected' ? 
            '<i class="fas fa-check-circle"></i>' : 
            '<i class="fas fa-plug"></i>';
            
          statusText.textContent = 
            data.status === 'connected' ? 'Bot is Active' : 
            data.status === 'pairing' ? 'Waiting for Pairing' :
            data.status === 'reconnecting' ? 'Reconnecting...' :
            'Ready to Connect';
            
          // Update last update time
          const updateTime = new Date(data.timestamp).toLocaleTimeString();
          lastUpdate.textContent = \`Last update: \${updateTime}\`;
          
          // Show/hide disconnect button
          const disconnectBtn = document.querySelector('button[onclick="disconnectBot()"]');
          if (disconnectBtn) {
            disconnectBtn.style.display = data.status === 'connected' ? 'block' : 'none';
          }
        }
        
        async function disconnectBot() {
          if (!confirm('Are you sure you want to disconnect the bot?')) return;
          
          try {
            const response = await fetch('/disconnect', { method: 'POST' });
            const data = await response.json();
            
            showResponse('success', data.message || 'Disconnected successfully');
            setTimeout(checkStatus, 1000);
          } catch (error) {
            showResponse('error', 'Failed to disconnect: ' + error.message);
          }
        }
        
        document.getElementById('pairForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const phoneNumber = document.getElementById('phoneNumber').value;
          const pairBtn = document.getElementById('pairBtn');
          const pairResponse = document.getElementById('pairResponse');
          const codeResult = document.getElementById('codeResult');
          
          // Validate phone number
          if (!/^[0-9]{10,15}$/.test(phoneNumber)) {
            showResponse('error', 'Please enter a valid phone number (10-15 digits)');
            return;
          }
          
          pairBtn.disabled = true;
          pairBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating Code...';
          pairResponse.style.display = 'none';
          codeResult.style.display = 'none';
          
          try {
            const response = await fetch('/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber })
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Show pairing code
              document.getElementById('pairingCodeDisplay').textContent = data.pairingCode;
              codeResult.style.display = 'block';
              
              showResponse('success', 'Pairing code generated successfully!');
              
              // Scroll to code
              document.getElementById('codeResult').scrollIntoView({ behavior: 'smooth' });
            } else {
              showResponse('error', data.message || 'Failed to generate pairing code');
            }
          } catch (error) {
            showResponse('error', 'Network error: ' + error.message);
          } finally {
            pairBtn.disabled = false;
            pairBtn.innerHTML = '<i class="fas fa-qrcode"></i> Generate Pairing Code';
          }
        });
        
        function showResponse(type, message) {
          const responseDiv = document.getElementById('pairResponse');
          responseDiv.className = 'response ' + type;
          responseDiv.innerHTML = \`
            <i class="fas \${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            \${message}
          \`;
          responseDiv.style.display = 'block';
        }
        
        async function refreshLogs() {
          try {
            const response = await fetch('/logs');
            const data = await response.json();
            const logsDiv = document.getElementById('activityLogs');
            logsDiv.innerHTML = data.logs.map(log => \`<div>\${log}</div>\`).join('');
            logsDiv.scrollTop = logsDiv.scrollHeight;
          } catch (error) {
            console.error('Failed to refresh logs:', error);
          }
        }
        
        function clearLogs() {
          if (confirm('Clear all activity logs?')) {
            fetch('/logs/clear', { method: 'POST' })
              .then(() => refreshLogs())
              .catch(error => console.error('Failed to clear logs:', error));
          }
        }
        
        // Start polling on page load
        document.addEventListener('DOMContentLoaded', () => {
          startPolling();
          checkStatus();
          refreshLogs();
        });
      </script>
    </body>
    </html>
  `);
});

// API endpoint to request pairing code
app.post('/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ 
      success: false, 
      error: 'Phone number is required' 
    });
  }

  // Validate phone number format
  if (!/^[0-9]{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format. Use 10-15 digits without + or spaces.'
    });
  }

  try {
    logger.info(`Pairing request for: ${phoneNumber}`);
    addActivityLog(`Pairing request for: ${phoneNumber}`);
    
    if (sock && connectionStatus === 'connected') {
      return res.json({ 
        success: false, 
        message: 'Bot is already connected',
        status: connectionStatus,
        connectedPhone
      });
    }

    // If socket exists but not connected, clean up
    if (sock && connectionStatus !== 'connected') {
      try {
        await sock.logout();
      } catch (e) {
        // Ignore logout errors
      }
      sock = null;
    }

    // Start connection process
    await startBot(phoneNumber);
    
    // Wait for pairing code (with timeout)
    const maxAttempts = 30; // 15 seconds
    let attempts = 0;
    
    while (!pairingCode && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
      
      // Check if connection was established directly
      if (connectionStatus === 'connected') {
        addActivityLog(`Connected to ${phoneNumber} without pairing`);
        return res.json({
          success: true,
          message: 'Connected successfully without pairing code',
          status: connectionStatus,
          phone: connectedPhone
        });
      }
    }

    if (pairingCode) {
      addActivityLog(`Pairing code generated for ${phoneNumber}: ${pairingCode}`);
      res.json({ 
        success: true, 
        pairingCode,
        phoneNumber,
        message: 'Enter this code in WhatsApp → Linked Devices → Link with phone number',
        status: connectionStatus
      });
    } else {
      addActivityLog(`Failed to generate pairing code for ${phoneNumber}`);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate pairing code. Please try again.' 
      });
    }
  } catch (error) {
    logger.error('Pairing error:', error);
    addActivityLog(`Pairing error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get connection status
app.get('/status', (req, res) => {
  res.json({ 
    status: connectionStatus,
    phone: connectedPhone,
    connected: connectionStatus === 'connected',
    pairingCode: connectionStatus === 'pairing' ? pairingCode : null,
    timestamp: lastConnectionUpdate,
    uptime: process.uptime()
  });
});

// Disconnect bot
app.post('/disconnect', async (req, res) => {
  try {
    logger.info('Disconnect request received');
    addActivityLog('Disconnect request received');
    
    if (sock) {
      await sock.logout();
      sock = null;
    }
    
    // Clear auth session
    try {
      const files = fs.readdirSync(authDir);
      for (const file of files) {
        fs.unlinkSync(path.join(authDir, file));
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    connectionStatus = 'disconnected';
    connectedPhone = null;
    pairingCode = null;
    lastConnectionUpdate = new Date();
    
    addActivityLog('Bot disconnected successfully');
    res.json({ 
      success: true, 
      message: 'Disconnected successfully',
      timestamp: lastConnectionUpdate
    });
  } catch (error) {
    logger.error('Disconnect error:', error);
    addActivityLog(`Disconnect error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check with detailed info
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'whatsapp-bot',
    status: connectionStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    platform: process.platform,
    port: PORT
  });
});

// Get activity logs
app.get('/logs', (req, res) => {
  res.json({ logs: activityLogs });
});

// Clear activity logs
app.post('/logs/clear', (req, res) => {
  activityLogs = ['> Logs cleared'];
  res.json({ success: true, message: 'Logs cleared' });
});

// Test message endpoint
app.post('/send', async (req, res) => {
  const { to, message } = req.body;
  
  if (!to || !message) {
    return res.status(400).json({ 
      success: false, 
      error: 'Recipient and message are required' 
    });
  }
  
  if (connectionStatus !== 'connected') {
    return res.status(400).json({
      success: false,
      error: 'Bot is not connected',
      status: connectionStatus
    });
  }
  
  try {
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    
    addActivityLog(`Message sent to ${to}: ${message.substring(0, 50)}...`);
    res.json({
      success: true,
      message: 'Message sent successfully',
      to: jid
    });
  } catch (error) {
    logger.error('Send message error:', error);
    addActivityLog(`Failed to send message: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chat list
app.get('/chats', async (req, res) => {
  if (connectionStatus !== 'connected') {
    return res.status(400).json({
      success: false,
      error: 'Bot is not connected',
      status: connectionStatus
    });
  }
  
  try {
    const chats = sock.chats.all() || [];
    res.json({
      success: true,
      count: chats.length,
      chats: chats.slice(0, 50) // Return first 50 chats
    });
  } catch (error) {
    logger.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook for incoming messages (optional)
app.post('/webhook', (req, res) => {
  res.json({ received: true, timestamp: new Date().toISOString() });
});

async function startBot(phoneNumber) {
  try {
    logger.info(`Starting bot for ${phoneNumber}...`);
    addActivityLog(`Starting bot for ${phoneNumber}...`);
    
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: true,
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 60000,
    });

    // Request pairing code if not registered
    if (!state.creds.registered) {
      connectionStatus = 'pairing';
      pairingCode = await sock.requestPairingCode(phoneNumber);
      lastConnectionUpdate = new Date();
      logger.info(`Pairing code generated: ${pairingCode}`);
      addActivityLog(`Pairing code generated: ${pairingCode}`);
    } else {
      connectionStatus = 'connecting';
      logger.info('Using existing credentials');
      addActivityLog('Using existing credentials');
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      lastConnectionUpdate = new Date();
      
      if (qr) {
        logger.info('QR code received (not used in pairing mode)');
        addActivityLog('QR code received');
      }
      
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        logger.warn(`Connection closed. Reason: ${reason}`);
        addActivityLog(`Connection closed. Reason: ${reason}`);
        
        if (reason === DisconnectReason.loggedOut) {
          connectionStatus = 'disconnected';
          connectedPhone = null;
          pairingCode = null;
          logger.info('Logged out from WhatsApp');
          addActivityLog('Logged out from WhatsApp');
          
          // Clear auth files
          try {
            const files = fs.readdirSync(authDir);
            for (const file of files) {
              fs.unlinkSync(path.join(authDir, file));
            }
          } catch (e) {
            logger.error('Failed to clear auth files:', e);
          }
        } else {
          connectionStatus = 'reconnecting';
          logger.info('Attempting to reconnect...');
          addActivityLog('Attempting to reconnect...');
          setTimeout(() => startBot(phoneNumber), 5000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        connectedPhone = phoneNumber;
        pairingCode = null;
        logger.info(`✅ Connected to WhatsApp as ${phoneNumber}`);
        addActivityLog(`✅ Connected to WhatsApp as ${phoneNumber}`);
        
        // Send welcome message to self
        try {
          const selfJid = sock.user?.id;
          if (selfJid) {
            await sock.sendMessage(selfJid, { 
              text: `🤖 Edison Bot is now active!\n\nConnected as: ${phoneNumber}\nTime: ${new Date().toLocaleString()}`
            });
            addActivityLog('Welcome message sent');
          }
        } catch (e) {
          logger.warn('Could not send welcome message:', e);
        }
        
        // Log to Supabase if configured
        if (process.env.SUPABASE_URL) {
          await logToSupabase('Bot connected', 'info', phoneNumber);
        }
      } else if (connection === 'connecting') {
        connectionStatus = 'connecting';
        logger.info('Connecting to WhatsApp...');
        addActivityLog('Connecting to WhatsApp...');
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      for (const msg of messages) {
        try {
          // Ignore messages from myself
          if (msg.key.fromMe) continue;
          
          const text = msg.message?.conversation || 
                      msg.message?.extendedTextMessage?.text ||
                      msg.message?.imageMessage?.caption ||
                      '';
          
          const sender = msg.key.remoteJid;
          const senderName = msg.pushName || 'Unknown';
          
          logger.info(`Message from ${senderName}: ${text.substring(0, 50)}...`);
          addActivityLog(`Message from ${senderName}: ${text.substring(0, 50)}...`);
          
          // Handle commands
          if (text.startsWith('.') || text.startsWith('!')) {
            await handleCommand(msg, text);
          }
          
          // Log to Supabase if configured
          if (process.env.SUPABASE_URL) {
            await logToSupabase(text, 'message', senderName, sender);
          }
          
        } catch (error) {
          logger.error('Error processing message:', error);
        }
      }
    });

    // Handle message reactions
    sock.ev.on('messages.reaction', async (reactions) => {
      for (const reaction of reactions) {
        logger.info(`Reaction from ${reaction.key.participant || reaction.key.remoteJid}`);
        addActivityLog(`Reaction from ${reaction.key.participant || reaction.key.remoteJid}`);
      }
    });

  } catch (error) {
    logger.error('Failed to start bot:', error);
    addActivityLog(`Failed to start bot: ${error.message}`);
    connectionStatus = 'error';
    throw error;
  }
}

async function handleCommand(msg, text) {
  const command = text.slice(1).split(' ')[0].toLowerCase();
  const args = text.slice(command.length + 2);
  const sender = msg.key.remoteJid;
  const senderName = msg.pushName || 'Unknown';
  
  logger.info(`Command received: ${command} from ${senderName}`);
  addActivityLog(`Command: ${command} from ${senderName}`);
  
  try {
    switch (command) {
      case 'ping':
        await sock.sendMessage(sender, { 
          text: `🏓 Pong! Bot is active.\nStatus: ${connectionStatus}\nUptime: ${Math.floor(process.uptime() / 60)} minutes`
        });
        break;
        
      case 'help':
        const helpText = `📚 *Edison Bot Commands* 🤖

*Basic Commands:*
• .ping - Check bot status
• .help - Show this message
• .time - Current server time
• .status - Connection status

*Utility Commands:*
• .echo [text] - Repeat your text
• .calc [expression] - Simple calculator

*Admin Commands:*
• .restart - Restart bot (admin only)
• .logs - View recent logs (admin only)

Need help? Contact support.`;
        await sock.sendMessage(sender, { text: helpText });
        break;
        
      case 'time':
        await sock.sendMessage(sender, { 
          text: `🕰️ Server Time: ${new Date().toLocaleString()}`
        });
        break;
        
      case 'status':
        await sock.sendMessage(sender, { 
          text: `📊 *Bot Status*\n\n` +
                `• Connection: ${connectionStatus}\n` +
                `• Phone: ${connectedPhone || 'Not connected'}\n` +
                `• Uptime: ${Math.floor(process.uptime() / 60)} minutes\n` +
                `• Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        });
        break;
        
      case 'echo':
        if (args.trim()) {
          await sock.sendMessage(sender, { text: args });
        } else {
          await sock.sendMessage(sender, { text: 'Usage: .echo [text]' });
        }
        break;
        
      case 'calc':
        try {
          // Safe evaluation - only basic math
          if (/^[0-9+\-*/().\s]+$/.test(args)) {
            const result = eval(args);
            await sock.sendMessage(sender, { text: `${args} = ${result}` });
          } else {
            await sock.sendMessage(sender, { text: 'Invalid expression. Only numbers and + - * / ( ) allowed.' });
          }
        } catch (e) {
          await sock.sendMessage(sender, { text: 'Calculation error. Please check your expression.' });
        }
        break;
        
      default:
        await sock.sendMessage(sender, { 
          text: `❓ Unknown command: ${command}\nType .help for available commands.`
        });
    }
  } catch (error) {
    logger.error(`Command error (${command}):`, error);
    await sock.sendMessage(sender, { 
      text: '⚠️ Error processing command. Please try again.'
    });
  }
}

async function logToSupabase(event, type, phone = null, metadata = null) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return false;
  }
  
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/bot-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        event,
        type,
        phone,
        metadata,
        timestamp: new Date().toISOString(),
        status: connectionStatus
      }),
      timeout: 5000
    });
    
    return response.ok;
  } catch (error) {
    logger.error('Supabase log error:', error);
    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  addActivityLog('Server shutting down...');
  
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      // Ignore errors during shutdown
    }
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM');
  addActivityLog('Received SIGTERM signal');
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  addActivityLog(`Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  addActivityLog(`Unhandled Rejection: ${reason}`);
});

// Server startup
app.listen(PORT, () => {
  logger.info(`🤖 Bot server running on port ${PORT}`);
  logger.info(`🌐 Dashboard: http://localhost:${PORT}`);
  logger.info(`📞 Health check: http://localhost:${PORT}/health`);
  logger.info(`🔄 Status: http://localhost:${PORT}/status`);
  addActivityLog(`Server started on port ${PORT}`);
});