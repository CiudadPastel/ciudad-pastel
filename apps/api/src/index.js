import app from "./app.js";

const PORT = process.env.PORT || 3000;

// Starts the HTTP server.
app.listen(PORT, () => {
    console.log(
        `API running on http://localhost:${PORT}`
    );

    console.log(
        `API docs available at http://localhost:${PORT}/api/docs`
    );
});
