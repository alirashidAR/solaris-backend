require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, getDocs, onSnapshot } = require('firebase/firestore');
const cors = require('cors');
const { error } = require('console');

const app = express();
app.use(cors());
app.use(express.json());

// Original Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Hangman Firebase configuration
const hangmanFirebaseConfig = {
    apiKey: process.env.HANG_API_KEY,
    authDomain: process.env.HANG_AUTH_DOMAIN,
    databaseURL: process.env.HANG_DATABASE_URL,
    projectId: process.env.HANG_PROJECT_ID,
    storageBucket: process.env.HANG_STORAGE_BUCKET,
    messagingSenderId: process.env.HANG_MESSAGING_SENDER_ID,
    appId: process.env.HANG_APP_ID
};



const firebaseApp = initializeApp(firebaseConfig);
const hangmanApp = initializeApp(hangmanFirebaseConfig, "hangman");

const db = getFirestore(firebaseApp);
const hangmanDb = getFirestore(hangmanApp);

let teamData = {};

function getSortedTeams() {
    return Object.keys(teamData).sort((a, b) => teamData[b] - teamData[a])
        .map(teamName => ({
            name: teamName,
            balance: teamData[teamName]
        }));
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.send(JSON.stringify({ type: 'teams', data: getSortedTeams() }));
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

onSnapshot(collection(db, 'approved_buyers'), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const teamName = change.doc.id;
        const balance = change.doc.data().balance;
        
        if (change.type === "added" || change.type === "modified") {
            teamData[teamName] = balance;
        } else if (change.type === "removed") {
            delete teamData[teamName];
        }
    });

    const sortedTeams = getSortedTeams();
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'teams', data: sortedTeams }));
        }
    });
}, (error) => {
    console.error("Error listening to team changes: ", error);
});

app.get('/teams', (req, res) => {
    res.json(getSortedTeams());
});

app.get('/items', async (req, res) => {
    try {
        const itemsArray = [];
        const querySnapshot = await getDocs(collection(db, "items"));
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            itemsArray.push({
                name: doc.id,
                quantity: data.quantity || 0,
                price: data.price || 0
            });
        });
        
        res.json(itemsArray);
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).json({ error: "An error occurred while fetching items" });
    }
});



app.get('/hangman-scores', async (req, res) => {
    try {
        const teamsSnapshot = await getDocs(collection(hangmanDb, "teams"));
        let teams = [];
        teamsSnapshot.forEach((doc) => {
            teams.push({ id: doc.id, ...doc.data() });
        });

        if (teams.length === 0) {
            return res.status(404).json({ error: "No teams found in the database." });
        }

        // Sort teams by score in descending order (highest score first)
        teams.sort((a, b) => (b.score || 0) - (a.score || 0));

        // Prepare the response data
        const responseData = {
            top3: teams.slice(0, 3).map(team => ({
                name: team.name || 'Unknown',
                score: team.score != null ? team.score : 'N/A'
            })),
            leaderboard: teams.slice(3).map((team, index) => ({
                place: index + 4,
                name: team.name || 'Unknown',
                score: team.score != null ? team.score : 'N/A'
            }))
        };

        res.json(responseData);
    } catch (error) {
        console.error("Error fetching Hangman scores:", error);
        res.status(500).json({ error: "An error occurred while fetching Hangman scores" });
    }
});


app.get('/', async(req,res)=>{
    res.status(200).json({
        works:"YES"
    })
})

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});