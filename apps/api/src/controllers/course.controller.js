import {
    createCourse as createCourseService
} from "../services/course.service.js";


// Handles the HTTP request to create a new course.
export async function createCourse(req, res) {
    try {
        const course = await createCourseService(req.body);

        return res.status(201).json(course);
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
                errors: error.details
            });
        }

        console.error(
            "Course creation error:",
            error
        );

        return res.status(500).json({
            message: "Could not create course."
        });
    }
}