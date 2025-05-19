// server.js (Backend) - FULL UPDATED CODE
require('dotenv').config();

const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const crypto = require('crypto');
const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const verifyServiceId = process.env.TWILIO_VERIFY_SERVICE_SID;
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET_KEY;
const { body, validationResult } = require('express-validator');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection Pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const usersTable = 'users'; // Or, if necessary, '"Users"'

// Remove simpleHash function

function generateVerificationCode(length) {
    return crypto.randomInt(0, Math.pow(10, length)).toString().padStart(length, '0');
}

// Routes
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login-page.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User Registration
app.post('/users/', [
    body('email').isEmail().withMessage('Invalid email'),
    body('first_name').notEmpty().withMessage('First name required'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, first_name, password } = req.body;
    if (!email || !first_name || !password) {
        return res.status(400).json({ detail: 'Missing fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO ${usersTable} (email, first_name, password) VALUES ($1, $2, $3) RETURNING *`,
                [email, first_name, hashedPassword]
            );
            res.status(201).json({ message: 'User registered', user: result.rows[0] });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
app.post('/users/login', [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ detail: 'Missing fields' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM ${usersTable} WHERE email = $1`,
                [email]
            );
            const user = result.rows[0];

            if (user && await bcrypt.compare(password, user.password)) {
                const token = jwt.sign({ userId: user.id, email: user.email }, secretKey, { expiresIn: '1h' });
                res.status(200).json({ message: 'Login success', access_token: token });
            } else {
                res.status(401).json({ detail: 'Invalid credentials' });
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, secretKey, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// User Logout
app.post('/users/logout', (req, res) => {
    console.log('Logout request');
    res.status(200).json({ message: 'Logout success' });
});

// Twilio Verify - Send Code
app.post('/verify/send-code', authenticateToken, async (req, res) => {
    const { phoneNumber, countryCode } = req.body;

    if (!phoneNumber || !countryCode) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const to = countryCode + phoneNumber;

    const client = await pool.connect(); // Get a client from the pool
    try {
        await client.query('BEGIN'); // Start a transaction

        // Update the user's phone number in the database
        await client.query(
            `UPDATE ${usersTable} SET phone_number = $1, country_code = $2 WHERE email = $3`,
            [phoneNumber, countryCode, req.user.email]
        );

        // Send the Twilio verification code
        const verification = await twilioClient.verify.v2.services(verifyServiceId)
            .verifications
            .create({ to: to, channel: 'sms' });

        await client.query('COMMIT'); // Commit the transaction

        console.log(`Verification started: ${verification.sid}`);
        res.json({ success: true, message: 'Code sent', verificationSid: verification.sid });
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction on error
        console.error('Twilio/DB Error:', error);
        res.status(500).json({ error: 'Failed to send code' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

// Twilio Verify - Check Code
app.post('/verify/check-code', authenticateToken, async (req, res) => {
    const { phoneNumber, countryCode, code } = req.body;

    if (!phoneNumber || !countryCode || !code) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const to = countryCode + phoneNumber;

    try {
        const verification_check = await twilioClient.verify.v2.services(verifyServiceId)
            .verificationChecks
            .create({ to: to, code: code });

        console.log(`Verification status: ${verification_check.status}`);
        if (verification_check.status === 'approved') {
            const client = await pool.connect();
            try {
                await client.query(
                    `UPDATE ${usersTable} SET phone_verified = TRUE WHERE email = $1`,
                    [req.user.email]
                );
                res.json({ success: true, message: 'Phone verified' });
            } finally {
                client.release();
            }
        } else {
            res.status(400).json({ error: 'Invalid code' });
        }
    } catch (error) {
        console.error('Twilio/DB Error:', error);
        res.status(500).json({ error: 'Failed to verify' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});