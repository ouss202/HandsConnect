const express = require('express');
const cors = require('cors');

//IMP NOTE: The backend now limits CORS to requests from http://localhost:3000. 
//Modify this if you deploy your frontend to a different URL.

const app = express();

// Middleware setup
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});
app.use(cors());  // Allow requests from any origin

// Simulated user data (replace with a real database later)
const users = [{ email: 'user@domain.com', password: 'password123' }];

// Login Route
app.post('/api/login', (req, res) => {
    console.log("Login request received:", req.body); // Log the request data

    const { email, password } = req.body;

    // Check if the user exists and the password is correct
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        console.log("✅ Login successful for:", email); // Log success
        res.json({ message: 'Login successful!', token: 'fake-jwt-token' });
    } else {
        console.log("❌ Login failed for:", email); // Log failure
        res.status(401).json({ error: 'Invalid email or password' });
    }
});

// Test route for server health check
app.get('/', (req, res) => {
    res.send('Server is running!');
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
