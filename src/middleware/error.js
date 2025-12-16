function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  if (err.message.includes('not found') || err.message.includes('expired')) {
    return res.status(404).json({ error: err.message });
  }
  
  if (err.message.includes('does not match')) {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
