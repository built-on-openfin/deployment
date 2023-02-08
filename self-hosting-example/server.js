const express = require('express');
const app = express();
const path = require('path');

const port = process.env.PORT || 5555;

app.use(express.static('public'));

// For the demo
app.get('/manifest', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.json'));
});
// For the demo
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/launch', (req, res) => {
    res.sendFile(path.join(__dirname, 'launch.html'));
})

app.listen(port, () => {
    console.log(`Server listening on Port ${port}`);
});
