const express = require('express');
const app = express();
const port = 3000;
const path = require('path'); //  Import the 'path' module

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//  Serve static files from the same directory as server.js
app.use(express.static(__dirname));

//  Route for the registration page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

//  Route for the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login-page.html'));
});

// Route to handle user registration (POST request to /users/)
  app.post('/users/', (req, res) => {
        console.log('Request Headers:', req.headers);  //  Log the headers
        console.log('Request Body:', req.body);     //  Log the entire body
        console.log('Registration data received:', req.body);

        const { email, first_name, password } = req.body;

        if (!email || !first_name || !password) {
            return res.status(400).json({ detail: 'Email, first name, and password are required.' });
        }

        console.log('Sending JSON response...');
        res.status(200).json({ message: 'Registration data received successfully!' });
    });

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
