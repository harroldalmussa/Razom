const express = require('express');
const app = express();
const port = 3000;
const path = require('path');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory user storage (INSECURE - FOR LEARNING ONLY!)
const users = [];

// Simple (INSECURE) password hashing (FOR LEARNING ONLY!)
function simpleHash(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

// Routes to serve HTML pages
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login-page.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main-page.html'));
});

// API endpoints
app.post('/users/', (req, res) => {
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
    console.log('Login data received:', req.body);
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ detail: 'Email and password are required.' });
    }

    const hashedPassword = simpleHash(password);
    const user = users.find(u => u.email === email && u.password === hashedPassword);

    if (user) {
        res.status(200).json({ message: 'Login successful!', access_token: 'dummy_token' }); // Simplified token
    } else {
        res.status(401).json({ detail: 'Invalid credentials' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
