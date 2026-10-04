
const firebaseConfig = {
  apiKey: "AIzaSyATA33OKGc2lKPl9yMZbKxi1wNmJE-G_6E",
  authDomain: "skibiditralalerotralala67.firebaseapp.com",
  projectId: "skibiditralalerotralala67",
  storageBucket: "skibiditralalerotralala67.firebasestorage.app",
  messagingSenderId: "38405127217",
  appId: "1:38405127217:web:30ca9111bffa06db5c2910",
  measurementId: "G-TJ5Y954GX0"
};

var db;

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("firebase initialized", firebase.app().name)
  db = firebase.firestore();
}

db.collection("freefirelmao123").get().then((querySnapshot) => { querySnapshot.forEach((doc) => { const freefirelmao123 = doc.data(); console.log(freefirelmao123) }); });

