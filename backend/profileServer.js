<<<<<<< HEAD
<<<<<<< HEAD
const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const pool = require("./db"); // Import the database connection

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

const storage = multer.diskStorage({
    destination: "./uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Fetch profile from the database
app.get("/profile", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM volunteer_profiles LIMIT 1");
        if (rows.length > 0) {
            const profile = {
                name: rows[0].name,
                email: rows[0].email,
                phone: rows[0].phone,
                skills: rows[0].skills ? rows[0].skills.split(",") : [],
                experiences: rows[0].experiences ? rows[0].experiences.split(",") : [],
                imageUrl: rows[0].imageUrl || "default.jpg"
            };
            res.json(profile);
        } else {
            res.status(404).json({ success: false, message: "Profile not found" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Upload profile picture
app.post("/upload-profile-picture", upload.single("profilePicture"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;

    try {
        await pool.query("UPDATE volunteer_profiles SET imageUrl = ? WHERE id = 1", [imageUrl]);
        res.json({ success: true, imageUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Update profile in the database or create a new profile if none exists
app.post("/update-profile", async (req, res) => {
    const { id, name, email, phone, skills, experiences, imageUrl } = req.body;

    try {
        // Check if the profile exists, if not, insert a new one
        const [existingProfile] = await pool.query("SELECT * FROM volunteer_profiles WHERE id = ?", [id]);

        if (existingProfile.length > 0) {
            // If the profile exists, update it
            await pool.query(
                "UPDATE volunteer_profiles SET name = ?, email = ?, phone = ?, skills = ?, experiences = ?, imageUrl = ? WHERE id = ?",
                [name, email, phone, skills.join(","), experiences.join(","), imageUrl, id]
            );
            res.json({ success: true, message: "Profile updated successfully!" });
        } else {
            // If the profile doesn't exist, create a new one
            await pool.query(
                "INSERT INTO volunteer_profiles (id, name, email, phone, skills, experiences, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [id, name, email, phone, skills.join(","), experiences.join(","), imageUrl]
            );
            res.json({ success: true, message: "Profile created successfully!" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
=======
=======
>>>>>>> main
/* eslint-disable no-undef */
const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const pool = require("./db"); // Import the database connection

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

const storage = multer.diskStorage({
    destination: "./uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Fetch profile from the database
app.get("/profile", async(req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM volunteer_profiles LIMIT 1");
        if (rows.length > 0) {
            const profile = {
                name: rows[0].name,
                email: rows[0].email,
                phone: rows[0].phone,
                skills: rows[0].skills ? rows[0].skills.split(",") : [],
                experiences: rows[0].experiences ? rows[0].experiences.split(",") : [],
                imageUrl: rows[0].imageUrl || "default.jpg"
            };
            res.json(profile);
        } else {
            res.status(404).json({ success: false, message: "Profile not found" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Upload profile picture
app.post("/upload-profile-picture", upload.single("profilePicture"), async(req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;

    try {
        await pool.query("UPDATE volunteer_profiles SET imageUrl = ? WHERE id = 1", [imageUrl]);
        res.json({ success: true, imageUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Update profile in the database or create a new profile if none exists
app.post("/update-profile", async(req, res) => {
    const { id, name, email, phone, skills, experiences, imageUrl } = req.body;

    try {
        // Check if the profile exists, if not, insert a new one
        const [existingProfile] = await pool.query("SELECT * FROM volunteer_profiles WHERE id = ?", [id]);

        if (existingProfile.length > 0) {
            // If the profile exists, update it
            await pool.query(
                "UPDATE volunteer_profiles SET name = ?, email = ?, phone = ?, skills = ?, experiences = ?, imageUrl = ? WHERE id = ?", [name, email, phone, skills.join(","), experiences.join(","), imageUrl, id]
            );
            res.json({ success: true, message: "Profile updated successfully!" });
        } else {
            // If the profile doesn't exist, create a new one
            await pool.query(
                "INSERT INTO volunteer_profiles (id, name, email, phone, skills, experiences, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, name, email, phone, skills.join(","), experiences.join(","), imageUrl]
            );
            res.json({ success: true, message: "Profile created successfully!" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
>>>>>>> c466c2c1c1cb9f3ef5e398a058b20bdbd9ca48d8
