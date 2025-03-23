/* eslint-disable no-undef */
require('dotenv').config();
console.log("JWT Secret:", process.env.JWT_SECRET);

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const crypto = require('crypto');
const winston = require("winston");
const logger = winston.createLogger({
    level: "info",
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "server.log" }),
    ],
});
logger.info("Server is starting...");

const app = express();
app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, '../frontend')));

const morgan = require("morgan");
app.use(morgan("combined"));

const helmet = require("helmet");
app.use(helmet());

const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 100, // Limit each IP to 100 requests
});
app.use(limiter);


// Middleware setup
app.use(express.json());
app.use(cors({
    origin: 'http://127.0.0.1:5500',
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// OAuth2 setup
const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

// Email transporter setup
async function createTransporter() {
    const accessToken = await oAuth2Client.getAccessToken();

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: process.env.EMAIL_USER,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN,
            accessToken: accessToken,
        },
    });
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    // ✅ Allow dev mode
    if (token === "dev-mode") {
        req.user = { ngo_id: 1 }; // 🔥 mock NGO user
        return next();
    }

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Registration endpoint
app.post('/api/register', async (req, res) => {
    const { name, email, password, role, volunteer, ngo } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    let connection;
    try {
        // Get a connection from the pool
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if email exists
        const [users] = await connection.execute('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Insert user into Users table
        const [userResult] = await connection.execute(
            `INSERT INTO Users (name, email, password_hash, role, Verified, verification_token) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, role, 'NO', verificationToken]
        );
        const userId = userResult.insertId;

        // Handle Volunteer registration
        if (role === 'Volunteer') {
            if (!volunteer?.city || !volunteer?.dob) {
                throw new Error('Missing city or date of birth for volunteer');
            }
            await connection.execute(
                `INSERT INTO Volunteers (user_id, phone, city, skills, Date_of_Birth) 
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, volunteer.phone || null, volunteer.city, volunteer.skills || null, volunteer.dob]
            );
        }

        // Handle NGO registration
        else if (role === 'NGO') {
            if (!ngo?.name || !ngo?.description || !ngo?.address) {
                throw new Error('Missing NGO name, description, or address');
            }
            const [ngoResult] = await connection.execute(
                `INSERT INTO NGOs (name, description, address) 
                 VALUES (?, ?, ?)`,
                [ngo.name, ngo.description, ngo.address]
            );

            // Link user to NGO
            await connection.execute(
                'UPDATE Users SET ngo_id = ? WHERE user_id = ?',
                [ngoResult.insertId, userId]
            );
        }

        // Commit transaction
        await connection.commit();
        connection.release();

        const verificationLink = `http://localhost:3000/api/verify-email?token=${verificationToken}`;
        const transporter = await createTransporter();

        await transporter.sendMail({
            from: `HandsConnect <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Email Verification',
            text: `Click the link to verify your email: ${verificationLink}`,
            html: `<p>Click the link to verify your email: <a href="${verificationLink}">Verify Email</a></p>`
        });

        res.status(201).json({ message: 'Registration successful. Check your email to verify your account.' });
    } catch (err) {
        // Proper error response
        console.error('Error:', err);
        res.status(500).json({
            error: err.message || 'Internal server error'
        });
    }
});

// Email verification endpoint
app.get('/api/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Invalid or missing token' });

    try {
        const [users] = await db.execute('SELECT * FROM Users WHERE verification_token = ?', [token]);
        if (users.length === 0) return res.status(400).json({ error: 'Invalid token' });

        await db.execute(
            "UPDATE Users SET Verified = 'YES', verification_token = NULL WHERE verification_token = ?",
            [token]
        );
        res.json({ message: 'Email verified successfully. You can now log in.' });
    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('Login request body:', req.body);

    try {
        const [users] = await db.execute('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        if (user.Verified !== 'YES') {
            return res.status(403).json({ error: 'Please verify your email before logging in.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        let redirectPath;
        switch (user.role.toLowerCase()) {
            case 'ngo':
                redirectPath = 'dashboard.html';
                break;
            case 'volunteer':
                redirectPath = 'opportunities.html';
                break;
            case 'admin':
                redirectPath = 'admin-dashboard.html';
                break;
            default:
                redirectPath = '/';
        }

        // Create JWT token
        const token = jwt.sign(
            {
                user_id: user.user_id,
                email: user.email,
                role: user.role,
                ngo_id: user.ngo_id
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Send response with redirect path
        res.json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role,
                ngo_id: user.ngo_id
            },
            redirect: redirectPath
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Password reset request endpoint
app.post('/api/request-password-reset', async (req, res) => {
    const { email } = req.body;

    try {
        const [users] = await db.execute('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }

        const user = users[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

        await db.execute(
            'UPDATE Users SET reset_token = ?, reset_token_expiry = ? WHERE user_id = ?',
            [resetToken, resetTokenExpiry, user.user_id]
        );

        const resetLink = `http://localhost:3000/reset-password.html?token=${resetToken}`;
        const transporter = await createTransporter();

        await transporter.sendMail({
            from: `HandsConnect <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Password Reset',
            text: `Click the link to reset your password: ${resetLink}`,
            html: `<p>Click the link to reset your password: <a href="${resetLink}">Reset Password</a></p>`
        });

        res.status(200).json({ message: 'Password reset link sent to your email.' });
    } catch (err) {
        console.error('Error requesting password reset:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Password reset endpoint
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const [users] = await db.execute('SELECT * FROM Users WHERE reset_token = ? AND reset_token_expiry > ?', [token, Date.now()]);
        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const user = users[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.execute(
            'UPDATE Users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = ?',
            [hashedPassword, user.user_id]
        );

        res.status(200).json({ message: 'Password reset successful. You can now log in with your new password.' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Opportunities endpoints
app.post('/api/opportunities', async (req, res) => {
    const { title, description, start_date, end_date, location, ngo_id } = req.body;

    if (!title || !description || !start_date || !end_date || !location) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const query = `
            INSERT INTO Opportunities (title, description, start_date, end_date, location, ngo_id)
            VALUES (?, ?, ?, ?, ?, ?)`;
        const [result] = await db.execute(query, [title, description, start_date, end_date, location, ngo_id]);


        console.log("✅ Opportunity saved:", {
            id: result.insertId,
            title,
            description,
            start_date,
            end_date,
            location,
        });

        res.status(201).json({ message: "Opportunity submitted successfully!", id: result.insertId });
    } catch (err) {
        console.error("❌ Error inserting opportunity:", err);
        res.status(500).json({ error: "Failed to submit opportunity." });
    }
});

// POST /api/applications - Store a volunteer application
app.post('/api/applications', authenticateToken, async (req, res) => {
    const { opportunity_id } = req.body;

    if (!opportunity_id) {
        return res.status(400).json({ error: "Opportunity ID is required." });
    }

    const volunteer_id = req.user.user_id;  // Get volunteer ID from the authenticated token

    try {
        // Check if the user has already applied for this opportunity
        const [existingApplication] = await db.execute(
            `SELECT * FROM Applications WHERE volunteer_id = ? AND opportunity_id = ?`,
            [volunteer_id, opportunity_id]
        );

        if (existingApplication.length > 0) {
            return res.status(400).json({ error: "You have already applied for this opportunity." });
        }

        // Insert a new application record
        const [result] = await db.execute(
            `INSERT INTO Applications (volunteer_id, opportunity_id, status) VALUES (?, ?, ?)`,
            [volunteer_id, opportunity_id, 'pending']
        );

        console.log(`✅ Application submitted by volunteer ${volunteer_id} for opportunity ${opportunity_id}`);

        res.status(201).json({ message: "Application submitted successfully.", application_id: result.insertId });
    } catch (err) {
        console.error("❌ Error submitting application:", err);
        res.status(500).json({ error: "Failed to submit application." });
    }
});

// ✅ First: DELETE route
app.delete('/api/opportunities/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const [results] = await db.execute("DELETE FROM Opportunities WHERE opportunity_id = ?", [id]);
        if (results.length === 0) {
            return res.status(404).json({ error: "Opportunity not found." });
        }

        const [result] = await db.execute("DELETE FROM Opportunities WHERE opportunity_id = ?", [id]);
        console.log(`✅ Opportunity deleted: ID ${id}`);
        res.json({ message: "Opportunity deleted successfully!" });

    } catch (err) {
        console.error("❌ Error deleting opportunity:", err);
        res.status(500).json({ error: "Failed to delete opportunity." });
    }
});

// ✅ Then: GET route
app.get('/api/opportunities', async (req, res) => {
    try {
        const [results] = await db.execute(`
            SELECT opportunity_id, title, description, start_date, end_date, location
            FROM Opportunities
            ORDER BY start_date ASC
        `);

        res.json(results);
    } catch (err) {
        console.error("❌ Error fetching opportunities:", err);
        res.status(500).json({ error: "Failed to fetch opportunities." });
    }
});

// ✅ Get a single opportunity by ID
app.get('/api/opportunities/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [results] = await db.execute(
            'SELECT * FROM Opportunities WHERE opportunity_id = ?',
            [id]
        );

        if (results.length === 0) {
            return res.status(404).json({ error: "Opportunity not found." });
        }

        res.json(results[0]);
    } catch (err) {
        console.error("❌ Error fetching opportunity:", err);
        res.status(500).json({ error: "Failed to fetch opportunity." });
    }
});

app.get('/api/opportunities/search', async (req, res) => {
    const { location, keyword } = req.query;
    try {
        const query = `
            SELECT opportunity_id, title, description, start_date, end_date, location, ngo_id
            FROM Opportunities
            WHERE location LIKE ? AND (title LIKE ? OR description LIKE ?)
            ORDER BY start_date ASC
        `;
        const [results] = await db.execute(query, [`%${location}%`, `%${keyword}%`, `%${keyword}%`]);

        res.json(results);
    } catch (err) {
        console.error("❌ Error fetching opportunities:", err);
        res.status(500).json({ error: "Failed to fetch opportunities." });
    }
});


// File handling setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }
    console.log("✅ File uploaded:", req.file.filename);
    res.json({ message: "File uploaded successfully!", filename: req.file.filename });
});

app.get('/api/files', (req, res) => {
    fs.readdir('uploads/', (err, files) => {
        if (err) {
            console.error("❌ Error reading files:", err);
            return res.status(500).json({ error: "Failed to retrieve files." });
        }
        res.json(files);
    });
});

app.delete('/api/files/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = `uploads/${filename}`;

    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("❌ Error deleting file:", err);
                return res.status(500).json({ error: "Failed to delete file." });
            }
            console.log(`✅ File deleted: ${filename}`);
            res.json({ message: "File deleted successfully!" });
        });
    } else {
        res.status(404).json({ error: "File not found." });
    }
});

// Protected route example
app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({
        message: "Access granted to protected resource",
        user: req.user
    });
});

// Admin endpoints
app.get('/api/admin/users', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT * FROM Users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.post('/api/admin/ngos/:ngo_id/approve', async (req, res) => {
    try {
        const { ngo_id } = req.params;
        await db.execute(
            'UPDATE NGOs SET approval_status = "approved" WHERE ngo_id = ?',
            [ngo_id]
        );
        res.json({ message: "NGO approved successfully" });
    } catch (err) {
        res.status(500).json({ error: "Approval failed" });
    }
});

app.post('/api/admin/ngos/:ngo_id/reject', async (req, res) => {
    try {
        const { ngo_id } = req.params;
        await db.execute(
            'UPDATE NGOs SET approval_status = "rejected" WHERE ngo_id = ?',
            [ngo_id]
        );
        res.json({ message: "NGO rejected successfully" });
    } catch (err) {
        res.status(500).json({ error: "Rejection failed" });
    }
});

app.get('/api/admin/ngos/pending', async (req, res) => {
    try {
        const [ngos] = await db.execute(
            'SELECT ngo_id, name, description FROM NGOs WHERE approval_status = "pending"'
        );
        res.json(ngos);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch NGOs" });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM Users WHERE user_id = ?', [req.params.id]);
        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ error: "Deletion failed" });
    }
});

app.patch('/api/admin/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'banned'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        await db.execute(
            'UPDATE Users SET account_status = ? WHERE user_id = ?',
            [status, id]
        );

        res.json({ message: 'Account status updated' });
    } catch (err) {
        res.status(500).json({ error: "Status update failed" });
    }
});

// Health check
app.get('/', (req, res) => {
    res.send('Server is running!');
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});