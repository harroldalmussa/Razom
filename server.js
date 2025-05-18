const express = require('express');
const app = express();
const port = 3000;
const path = require('path');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const users = []; 

function simpleHash(password) { // Simple (INSECURE) password hashing. need to build a better one
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login-page.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


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
        const token = simpleHash(email + hashedPassword + Date.now()); // Simple token (INSECURE!)
        res.status(200).json({ message: 'Login successful!', access_token: token });
    } else {
        res.status(401).json({ detail: 'Invalid credentials' });
    }
});

app.post('/users/logout', (req, res) => {
    // In a real application, you'd invalidate the token or session
    console.log('Logout request received');
    res.status(200).json({ message: 'Logout successful!' });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
