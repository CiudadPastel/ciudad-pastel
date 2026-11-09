import { test } from "node:test";
import assert from "node:assert/strict";

import {
    COURSE_LIMITS,
    EMPTY_COURSE_FORM,
    courseToFormValues,
    mapApiValidationErrors,
    toCoursePayload,
    validateCourseForm
} from "../src/utils/courseValidation.js";

const validCourseForm = {
    ...EMPTY_COURSE_FORM,
    name: "Curso de prueba",
    summary: "Resumen de prueba suficientemente largo",
    description: "Descripción de prueba suficientemente larga.",
    seasonEnabled: true,
    seasonName: "Navidad"
};

test("season name is required and limited to the API's 2–60 characters", () => {
    assert.match(
        validateCourseForm({ ...validCourseForm, seasonName: "" }).seasonName,
        /nombre de la temporada/i
    );
    assert.match(
        validateCourseForm({ ...validCourseForm, seasonName: "A" }).seasonName,
        /al menos 2 caracteres/
    );
    assert.match(
        validateCourseForm({
            ...validCourseForm,
            seasonName: "N".repeat(COURSE_LIMITS.seasonName.max + 1)
        }).seasonName,
        /máximo 60 caracteres/
    );
    assert.equal(validateCourseForm(validCourseForm).seasonName, undefined);
});

test("season toggle prefills from the API and sends null when disabled", () => {
    assert.equal(courseToFormValues({ seasonName: "Navidad" }).seasonEnabled, true);
    assert.equal(courseToFormValues({ seasonName: null }).seasonEnabled, false);
    assert.equal(toCoursePayload({ ...validCourseForm, seasonEnabled: false }).seasonName, null);
    assert.equal(toCoursePayload(validCourseForm).seasonName, "Navidad");
});

test("backend season-name validation errors are translated to Spanish", () => {
    assert.match(
        mapApiValidationErrors(["seasonName must contain at least 2 characters."]).seasonName,
        /nombre de la temporada debe tener entre 2 y 60 caracteres/
    );
});
