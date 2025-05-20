// server.js (Backend) - FULL UPDATED CODE
const momentsTable = 'moments'; // New table name for moments
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

// IMPORTANT: Increase payload limits for JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' })); // Allows up to 10MB JSON body
app.use(express.urlencoded({ limit: '10mb', extended: true })); // For URL-encoded bodies (if you use it)

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
const postsTable = 'posts'; // New table name for posts

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
                `SELECT id, email, first_name, bio, profile_picture_url, password FROM ${usersTable} WHERE email = $1`,
                [email]
            );
            const user = result.rows[0];

            if (user && await bcrypt.compare(password, user.password)) {
                const token = jwt.sign({ userId: user.id, email: user.email }, secretKey, { expiresIn: '1h' });

                const userDataForFrontend = {
                    name: user.first_name,
                    email: user.email,
                    bio: user.bio || 'No bio yet.',
                    profilePicture: user.profile_picture_url || '/img/razom-logo.png'
                };

                res.status(200).json({
                    message: 'Login success',
                    access_token: token,
                    user: userDataForFrontend
                });
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

// Update User Profile
app.put('/users/profile', authenticateToken, async (req, res) => {
    const { name, email, bio, profilePicture } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: 'Name and Email are required' });
    }

    try {
        const client = await pool.connect();
        try {
            const query = `
                UPDATE ${usersTable}
                SET first_name = $1, email = $2, bio = $3, profile_picture_url = $4
                WHERE id = $5
                RETURNING id, email, first_name, bio, profile_picture_url;
            `;
            const values = [
                name,
                email,
                bio || null,
                profilePicture || '/img/razom-logo.png',
                req.user.userId
            ];

            const result = await client.query(query, values);

            if (result.rows.length > 0) {
                const updatedUser = result.rows[0];
                const userDataForFrontend = {
                    name: updatedUser.first_name,
                    email: updatedUser.email,
                    bio: updatedUser.bio || 'No bio yet.',
                    profilePicture: updatedUser.profile_picture_url || '/img/razom-logo.png'
                };
                res.json({ success: true, message: 'Profile updated successfully', user: userDataForFrontend });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Profile Update Error:', error);
        if (error.code === '23505') {
             return res.status(409).json({ error: 'Email already in use.' });
        }
        res.status(500).json({ error: 'Failed to update profile' });
    }
});


// NEW: Post Management Endpoints

// Create a new post
app.post('/posts', authenticateToken, async (req, res) => {
    const { content, image, feeling } = req.body; // image can be base64 string for now

    if (!content || content.length < 10 || content.length > 500) {
        return res.status(400).json({ error: 'Post content must be between 10 and 500 characters.' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO ${postsTable} (user_id, content, image_url, feeling) VALUES ($1, $2, $3, $4) RETURNING *`,
                [req.user.userId, content, image, feeling]
            );
            res.status(201).json({ success: true, message: 'Post created successfully', post: result.rows[0] });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Create Post Error:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// Get all posts for the authenticated user
app.get('/posts/my', authenticateToken, async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT id, content, image_url as image, feeling, timestamp FROM ${postsTable} WHERE user_id = $1 ORDER BY timestamp DESC`,
                [req.user.userId]
            );
            res.json({ success: true, posts: result.rows });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Get Posts Error:', error);
        res.status(500).json({ error: 'Failed to retrieve posts' });
    }
});

// Update a specific post
app.put('/posts/:id', authenticateToken, async (req, res) => {
    const postId = req.params.id;
    const { content, image, feeling } = req.body;

    if (!content || content.length < 10 || content.length > 500) {
        return res.status(400).json({ error: 'Post content must be between 10 and 500 characters.' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `UPDATE ${postsTable} SET content = $1, image_url = $2, feeling = $3 WHERE id = $4 AND user_id = $5 RETURNING *`,
                [content, image, feeling, postId, req.user.userId]
            );
            if (result.rows.length > 0) {
                res.json({ success: true, message: 'Post updated successfully', post: result.rows[0] });
            } else {
                res.status(404).json({ error: 'Post not found or unauthorized' });
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Update Post Error:', error);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

// Delete a specific post
app.delete('/posts/:id', authenticateToken, async (req, res) => {
    const postId = req.params.id;

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `DELETE FROM ${postsTable} WHERE id = $1 AND user_id = $2 RETURNING id`,
                [postId, req.user.userId]
            );
            if (result.rows.length > 0) {
                res.json({ success: true, message: 'Post deleted successfully', postId: result.rows[0].id });
            } else {
                res.status(404).json({ error: 'Post not found or unauthorized' });
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Delete Post Error:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});


// Twilio Verify - Send Code
app.post('/verify/send-code', authenticateToken, async (req, res) => {
    const { phoneNumber, countryCode } = req.body;

    if (!phoneNumber || !countryCode) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const to = countryCode + phoneNumber;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE ${usersTable} SET phone_number = $1, country_code = $2 WHERE email = $3`,
            [phoneNumber, countryCode, req.user.email]
        );

        const verification = await twilioClient.verify.v2.services(verifyServiceId)
            .verifications
            .create({ to: to, channel: 'sms' });

        await client.query('COMMIT');

        console.log(`Verification started: ${verification.sid}`);
        res.json({ success: true, message: 'Code sent', verificationSid: verification.sid });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Twilio/DB Error:', error);
        res.status(500).json({ error: 'Failed to send code' });
    } finally {
        client.release();
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

// Upload a new moment (image or video as Base64)
app.post('/moments', authenticateToken, async (req, res) => {
    const { src: imageData, type: fileType, note } = req.body; // 'src' from frontend will be Base64
    const userId = req.user.userId;

    if (!imageData || !fileType) {
        return res.status(400).json({ error: 'Image data and file type are required.' });
    }

    // Optional: Basic validation for file size (check if Base64 string is too long)
    // A rough estimate: 1MB of binary data ~ 1.37MB as Base64
    const maxBase64Length = 10 * 1024 * 1024 * 1.4; // Roughly 10MB original file size limit
    if (imageData.length > maxBase64Length) {
        return res.status(413).json({ error: `Payload too large. Max moment size is around ${Math.round(maxBase64Length / (1024 * 1024))}MB.` });
    }


    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO ${momentsTable} (user_id, image_data, file_type, note) VALUES ($1, $2, $3, $4) RETURNING id, image_data AS src, file_type AS type, note, timestamp`,
                [userId, imageData, fileType, note || null]
            );
            res.status(201).json({ success: true, message: 'Moment uploaded successfully', moment: result.rows[0] });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Upload Moment Error:', error);
        res.status(500).json({ error: 'Failed to upload moment' });
    }
});

// Get all moments for the authenticated user
app.get('/moments/my', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT id, image_data AS src, file_type AS type, note, timestamp FROM ${momentsTable} WHERE user_id = $1 ORDER BY timestamp DESC`,
                [userId]
            );
            res.json({ success: true, moments: result.rows });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Get Moments Error:', error);
        res.status(500).json({ error: 'Failed to retrieve moments' });
    }
});

// Delete a specific moment
app.delete('/moments/:id', authenticateToken, async (req, res) => {
    const momentId = req.params.id;
    const userId = req.user.userId;

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `DELETE FROM ${momentsTable} WHERE id = $1 AND user_id = $2 RETURNING id`,
                [momentId, userId]
            );
            if (result.rows.length > 0) {
                res.json({ success: true, message: 'Moment deleted successfully', momentId: result.rows[0].id });
            } else {
                res.status(404).json({ error: 'Moment not found or unauthorized' });
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Delete Moment Error:', error);
        res.status(500).json({ error: 'Failed to delete moment' });
    }
});