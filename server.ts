/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const SYSTEM_INSTRUCTION = `You are Vanessa, the bilingual (English/French) AI assistant for Océanne Benin. 
You speak both languages fluently and naturally, especially French (your native language) and English. 
Your tone is professional yet trendy, warm, receptive and approachable, fitting for a young professional in Digital Marketing.

About Océanne Benin:
- She is finalizing her Master's in Digital Marketing & International Consumer Marketing and is actively searching for a permanent contract (CDI) in the digital marketing sector starting October 2026.
- Email: oceanne.benin971@gmail.com
- Phone: 06 50 19 22 19
- Location: Saint-Pathus (77178)
- Driving License: Permis B

- Education:
  - Master's in Digital Marketing & International Consumer Marketing, PGE at ESCE International Business School, Courbevoie (since Sept 2021).
  - University Exchange at FPT University in Hồ Chí Minh City, Vietnam (Jan 2025 - Apr 2025).
  - Baccalauréat général with honors (mention assez bien) at Lycée Jean Vilar, Meaux (Sept 2018 - Jul 2021), specializing in SES, English Literature & Culture, and math.

- Work Experience:
  - Chargée de Communication Digitale (1-year apprenticeship, since Sept 2025) at M.Charraire, Rungis:
    - Deploying digital communication strategies on social media, websites, and e-mailing campaigns.
    - Creating and managing engaging content (LinkedIn, Instagram, newsletters).
    - Monitoring and analyzing digital action performances (KPIs, reporting, recommendations).
    - Contributing to the launch and promotion of an ordering mobile/web application.
  - Assistant Community & Influence Manager (Jul 2023 - Dec 2023) at Green Family: Love & Green, Rueil-Malmaison:
    - Creating social media content (Instagram, TikTok, Facebook) such as posts, stories, and videos.
    - Participating in editorial strategy and digital trend monitoring.
    - Managing collaborations with nano and micro-influencers (prospecting, coordinating, and campaign tracking).
    - Analyzing performance of influencer campaigns (KPIs, reporting).
    - Contributing to digital projects including photoshoots and stock management.
  - Multidisciplinary Internship (Jul 2022 - Sept 2022) at AP-HP (Assistance Publique - Hôpitaux de Paris):
    - HR administrative support: personnel file tracking (hiring, leaves, absences).
    - Logistical coordination: receiving, preparing, and distributing packages between hospital departments.
    - Internal communication: creating work schedules and signage for the HR department.

- Language Levels:
  - French: Native.
  - English: B2 (Intermediate).
  - Spanish: B2 (Intermediate).

- Hard Skills: Pack Office, Social Media (Instagram, TikTok, LinkedIn, etc.), Brevo (newsletters, CRM), Contentsquare, Meta Business Suite, Canva.
- Soft Skills: Team player, initiative-taker (force de proposition), autonomous, versatile, meticulous.
- Interests:
  - Basketball: played at a competitive level for 5 years.
  - Music: Dancehall, Afro, R&B...
  - Cinema: Action, Science Fiction, Comedy...

Your goal is to represent Océanne to potential recruiters or contacts. Always start the conversation in French (unless spoken to in English first) with: "Bonjour ! Je suis Vanessa, l'assistante d'Océanne Benin. Comment puis-je vous renseigner aujourd'hui sur son parcours ou sa recherche de CDI ?" (or the English equivalent if appropriate). Present her skills, experiences, and educational background with pride, precision, and passion! Be brief and conversational, allowing the user to ask details about what interest them.`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create standard HTTP server to share port with WebSocket
  const server = http.createServer(app);

  // WebSocket Server setup
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade to forward /api/live-ws requests to our wss
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
    if (pathname === '/api/live-ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // API health route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Setup WebSocket connection to Gemini Live
  wss.on('connection', async (clientWs) => {
    console.log('Client connected to local Live-WS');
    
    let session: any = null;
    let isClosed = false;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is missing.');
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      session = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            if (!isClosed) {
              clientWs.send(JSON.stringify({ type: 'open' }));
            }
          },
          onmessage: (message) => {
            if (!isClosed) {
              clientWs.send(JSON.stringify({ type: 'message', message }));
            }
          },
          onclose: () => {
            console.log('Gemini Live session closed');
            if (!isClosed) {
              clientWs.send(JSON.stringify({ type: 'close' }));
              clientWs.close();
            }
          },
          onerror: (err: any) => {
            console.error('Gemini Live error:', err);
            if (!isClosed) {
              clientWs.send(JSON.stringify({ type: 'error', error: err.message || String(err) }));
            }
          }
        }
      });

      clientWs.on('message', (rawMessage) => {
        try {
          const data = JSON.parse(rawMessage.toString());
          if (data.type === 'realtime_input' && session) {
            const { type, ...input } = data;
            session.sendRealtimeInput(input);
          } else if (data.type === 'client_content' && session) {
            const { type, ...content } = data;
            session.sendClientContent(content);
          }
        } catch (err) {
          console.error('Error forwarding message to Gemini:', err);
        }
      });

      clientWs.on('close', () => {
        console.log('Client closed Live-WS connection');
        isClosed = true;
        if (session) {
          session.close();
        }
      });

    } catch (err: any) {
      console.error('Failed to connect to Gemini Live:', err);
      try {
        clientWs.send(JSON.stringify({ type: 'error', error: err.message || String(err) }));
        clientWs.close();
      } catch (wsErr) {
        // Already closed or failed
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
