const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ElfParser = require('elf-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static('public'));

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.so')) {
      cb(null, true);
    } else {
      cb(new Error('Only .so files are allowed'));
    }
  }
});

// POST /api/symbols – extract symbols from uploaded .so
app.post('/api/symbols', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const buffer = req.file.buffer;
    const elf = new ElfParser(buffer);

    // 1) Try dynamic symbol table first (DT_SYMTAB)
    let symbols = [];
    try {
      const dynSym = elf.getDynamicSymbolTable();
      if (dynSym && dynSym.length > 0) {
        symbols = dynSym.map(s => s.name).filter(n => n && n.length > 0);
      }
    } catch (e) {
      // fallback to static symbol table
    }

    // 2) If no dynamic symbols, fallback to static .symtab
    if (symbols.length === 0) {
      const symtab = elf.getSymbolTable();
      if (symtab && symtab.length > 0) {
        symbols = symtab.map(s => s.name).filter(n => n && n.length > 0);
      }
    }

    if (symbols.length === 0) {
      return res.status(404).json({ error: 'No symbols found in this ELF file' });
    }

    // Remove duplicates and sort
    symbols = [...new Set(symbols)].sort();

    res.json({
      filename: req.file.originalname,
      count: symbols.length,
      symbols: symbols
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse ELF: ' + err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`Symbol server running on http://localhost:${PORT}`);
});
