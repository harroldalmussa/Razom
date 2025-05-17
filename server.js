// Import the Express.js library
const express = require('express');

// Create an instance of an Express application
const app = express();

// Define the port the server will listen on
const port = 3000;

// Middleware to parse URL-encoded request bodies
app.use(express.urlencoded({ extended: false }));
// Middleware to parse JSON request bodies
app.use(express.json());

// Define a basic route for the root path ('/')
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Route to handle user registration (POST request to /users/)
app.post('/users/', (req, res) => {
  console.log('Registration data received:', req.body);

  const { email, first_name, password } = req.body;

  if (!email || !first_name || !password) {
    return res.status(400).json({ detail: 'Email, first name, and password are required.' });
  }

  // In a real application, you would do more validation here
  // (e.g., email format, password strength) and then store the user.

  console.log('Sending JSON response...');
  res.status(200).json({ message: 'Registration data received successfully!' });
});

// Start the server and listen on the specified port
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
