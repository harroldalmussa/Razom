    const express = require('express');
    const app = express();
    const port = 3000;
    const path = require('path');
    const crypto = require('crypto'); // For generating codes (if needed, but Verify API generates codes)
    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN); // Twilio
    const verifyServiceId = process.env.TWILIO_VERIFY_SERVICE_SID; //  Your Verify Service SID
    const db = {}; //  Replace with a real database, to be done later!!

    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());

    app.use(express.static(path.join(__dirname, 'public')));

    const users = [];

    function simpleHash(password) {
        // ... (your existing hashing function - NOTE: still insecure! to change later!!)
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    function generateVerificationCode(length) {
        return crypto.randomInt(0, Math.pow(10, length)).toString().padStart(length, '0');
    }

    app.get('/register', (req, res) => {
        // ... (your existing register route)
        res.sendFile(path.join(__dirname, 'public', 'register.html'));
    });

    app.get('/login', (req, res) => {
        // ... (your existing login route)
        res.sendFile(path.join(__dirname, 'public', 'login-page.html'));
    });

    app.get('/', (req, res) => {
        // ... (your existing home route)
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.post('/users/', (req, res) => {
        // ... (your existing user creation route)
        console.log('Registration data received:', req.body);
        const { email, first_name, password } = req.body;
        if (!email || !first_name || !password) {
            return res.status(400).json({ detail: 'Email, first name, and password are required.' });
        }

        const hashedPassword = simpleHash(password);
        users.push({ email, first_name, password: hashedPassword });

        res.status(201).json({ message: 'Registration successful!' });
    });

    app.post('/users/login', (req, res) => {
        // ... (your existing login route)
        console.log('Login data received:', req.body);
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ detail: 'Email and password are required.' });
        }

        const hashedPassword = simpleHash(password);
        const user = users.find(u => u.email === email && u.password === hashedPassword);

        if (user) {
            const token = simpleHash(email + hashedPassword + Date.now()); // Simple token (INSECURE!)
            res.status(200).json({ message: 'Login successful!', access_token: token });
        } else {
            res.status(401).json({ detail: 'Invalid credentials' });
        }
    });

    app.post('/users/logout', (req, res) => {
        // ... (your existing logout route)
        // In a real application, you'd invalidate the token or session
        console.log('Logout request received');
        res.status(200).json({ message: 'Logout successful!' });
    });

    //  ---  SMS Verification Routes (using Twilio Verify)  ---
    app.post('/verify/send-code', (req, res) => {
        const { phoneNumber, countryCode } = req.body;

        if (!phoneNumber || !countryCode) {
            return res.status(400).json({ error: 'Phone number and country code are required.' });
        }

        const to = countryCode + phoneNumber; //  E.164 format

        client.verify.v2.services(verifyServiceId) //  Use your Verify Service SID
            .verifications
            .create({ to: to, channel: 'sms' })
            .then(verification => {
                console.log(`Verification started: ${verification.sid}`);
                res.json({ success: true, message: 'Verification code sent.', verificationSid: verification.sid }); //  Send back the SID
            })
            .catch(error => {
                console.error('Error starting verification:', error);
                res.status(500).json({ error: 'Failed to send verification code.' });
            });
    });

    app.post('/verify/check-code', (req, res) => {
        const { phoneNumber, countryCode, code } = req.body;

        if (!phoneNumber || !countryCode || !code) {
            return res.status(400).json({ error: 'Phone number, country code, and code are required.' });
        }

        const to = countryCode + phoneNumber;

        client.verify.v2.services(verifyServiceId)
            .verificationChecks
            .create({ to: to, code: code })
            .then(verification_check => {
                console.log(`Verification check status: ${verification_check.status}`); //  "approved" or "pending"
                if (verification_check.status === 'approved') {
                    //  Verification successful!  Update your user's record in the database!
                    //  TODO:  Update your user's record in the database!
                    res.json({ success: true, message: 'Phone number verified.' });
                } else {
                    res.status(400).json({ error: 'Invalid verification code.' });
                }
            })
            .catch(error => {
                console.error('Error checking verification:', error);
                res.status(500).json({ error: 'Failed to verify code.' });
            });
    });

    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
