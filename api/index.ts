import express from "express";
import nodemailer from "nodemailer";

const app = express();

app.use(express.json({ limit: "50mb" }));

// API Route for sending a SINGLE email
app.post("/api/send-email", async (req, res) => {
  const { credentials, to, subject, html } = req.body;

  if (!credentials || !credentials.email || !credentials.password) {
    return res.status(400).json({ error: "Email credentials are required." });
  }

  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing email parameters (to, subject, html)." });
  }

  try {
    // Create a transporter using the provided credentials
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: credentials.email,
        pass: credentials.password, // App Password
      },
    });

    // Generate a realistic Message-ID to look less like a bulk script
    const randomString = Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
    const domain = credentials.email.split('@')[1] || 'gmail.com';
    const messageId = `<${randomString}@${domain}>`;

    const info = await transporter.sendMail({
      from: `"${credentials.name || credentials.email}" <${credentials.email}>`,
      to: to,
      subject: subject,
      html: html,
      messageId: messageId,
      headers: {
        'X-Mailer': 'Apple Mail (2.3654.120.0)', // Spoof a common email client
      }
    });

    res.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error(`Failed to send to ${to} via ${credentials.email}:`, error);
    res.status(500).json({ error: error.message || "Failed to authenticate or send email." });
  }
});

// Catch-all for API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found or wrong method: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/')) {
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  } else {
    next(err);
  }
});

export default app;
