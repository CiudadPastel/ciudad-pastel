import { auth } from "../src/config/firebase.js";

const email = process.argv[2];

if (!email) {
    console.error("Usage: node scripts/set-admin.js <email>");
    process.exit(1);
}

try {
    const user = await auth.getUserByEmail(email);

    await auth.setCustomUserClaims(user.uid, {
        ...(user.customClaims || {}),
        admin: true
    });

    console.log(`Admin role assigned successfully to ${email}`);
    console.log(`UID: ${user.uid}`);

    process.exit(0);
} catch (error) {
    console.error("Could not assign admin role:");
    console.error(error.message);

    process.exit(1);
}