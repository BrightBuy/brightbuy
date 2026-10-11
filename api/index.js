import { db } from '../server/src/db.js';
import { createApp } from '../server/src/app.js';

const app = createApp(db, process.env.JWT_SECRET);

export default app;
