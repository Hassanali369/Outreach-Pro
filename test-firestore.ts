import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  try {
    await getDocs(collection(db, 'unsubscribes'));
    console.log("Success");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
test();
