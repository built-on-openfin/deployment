const express = require('express');
const rateLimit = require('express-rate-limit');
const app = express();
const path = require('path');

const port = process.env.PORT || 5555;

// Disable X-Powered-By header to hide Express framework information
app.disable('x-powered-by');

// Rate limiting configuration to prevent DoS attacks
const fileEndpointLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(express.static('public'));

// For the demo - with rate limiting to prevent DoS attacks
app.get('/manifest', fileEndpointLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.json'));
});
// For the demo - with rate limiting to prevent DoS attacks
app.get('/app', fileEndpointLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/launch', fileEndpointLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'launch.html'));
})

app.listen(port, () => {
    console.log(`Server listening on Port ${port}`);
});
