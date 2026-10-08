import {
    createCourse as createCourseService,
    getCourses as getCoursesService,
    getCourseById as getCourseByIdService
} from "../services/course.service.js";

// Handles the HTTP request to list administrative courses.
export async function getCourses(req, res) {
    try {
        const courses = await getCoursesService(req.query.status);

        return res.status(200).json(courses);
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message,
                errors: error.details
            });
        }

        console.error("Course list error:", error);

        return res.status(500).json({
            message: "Could not retrieve courses."
        });
    }
}

// Handles the HTTP request to retrieve an administrative course.
export async function getCourseById(req, res) {
    try {
        const course = await getCourseByIdService(req.params.id);

        return res.status(200).json(course);
    } catch (error) {
        if (error.name === "NotFoundError") {
            return res.status(404).json({
                message: error.message
            });
        }

        console.error("Course detail error:", error);

        return res.status(500).json({
            message: "Could not retrieve course."
        });
    }
}


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
