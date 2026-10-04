import express from "express";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import cors from "cors";
import cron from "node-cron";
import fetch from "node-fetch";
import { readFileSync } from "fs";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

//======================================================================
// SYSTEM OVERVIEW – STEAM ANALYTICS BACKEND (NODE.JS)
//======================================================================
//
// Backend này đóng vai trò:
// - Data collector (lấy dữ liệu từ Steam API)
// - Data storage (Firebase Firestore)
// - REST API server (Express)
// - Realtime updater (cron job)
//
// Kiến trúc tổng thể:
//
// Steam API
//     ↓
// Fetch Layer (node-fetch)
//     ↓
// Data Processing
//     ↓
// Firestore (games + games/{appid}/history)
//     ↓
// Express API
//     ↓
// Frontend (Chart / UI)
//
//======================================================================
// 1. CORE STACK
//======================================================================
//
// - express:
//   → tạo REST API server
//
// - firebase-admin (Firestore):
//   → database trên cloud, realtime, không cần file .db local
//
// - node-cron:
//   → chạy job định kỳ (update data)
//
// - node-fetch:
//   → gọi API từ Steam
//
//======================================================================
// 2. DATABASE DESIGN (FIRESTORE)
//======================================================================
//
// Có 2 collection chính:
//
//--------------------------------------------------
// COLLECTION: games   (doc id = appid, dạng string)
//--------------------------------------------------
//
// Lưu thông tin TĨNH (ghi 1 lần):
//
// - appid
// - name
// - developer
// - publisher
// - release_date
// - image
// - url
//
// Đồng thời CACHE giá trị ĐỘNG mới nhất ngay trên document
// (được ghi đè mỗi lần có dữ liệu mới), để truy vấn nhanh mà
// không cần JOIN như SQL:
//
// - price
// - players
// - positive
// - negative
// - updatedAt (timestamp lần cập nhật gần nhất)
//
// Dùng để render UI (card, carousel, top-games, ranking...)
//
//--------------------------------------------------
// SUBCOLLECTION: games/{appid}/history   (TIME SERIES DATA)
//--------------------------------------------------
//
// Mỗi document = 1 lần fetch, auto-id:
//
// - timestamp (ms)
// - price
// - players
// - positive
// - negative
//
// Đây là dữ liệu QUAN TRỌNG NHẤT
// Dùng cho:
// - Chart (players / price)
// - Phân tích xu hướng
//
//--------------------------------------------------
// COLLECTION: users   (doc id = username → tự đảm bảo UNIQUE)
//--------------------------------------------------
//
// - email
// - username
// - password (plain text)
//
// Dùng cho login/register
//======================================================================
// 3. GAME SOURCE (APPIDS)
//======================================================================
//
// - APPIDS: danh sách game cố định
// - uniqueAppIds: loại bỏ duplicate
//
// Đây là seed data ban đầu
//
//======================================================================
// 4. STEAM DATA FETCHING (CORE LOGIC)
//======================================================================
//
// fetchFullGameData(appid)
//
// Gọi đồng thời 3 API:
//
// 1. Steam Store API:
//    → thông tin game + giá
//
// 2. Steam Reviews API:
//    → tổng số review positive / negative
//
// 3. Steam Players API:
//    → số người chơi hiện tại
//
//--------------------------------------------------
//
// Trả về object chuẩn:
//
// {
//   appid,
//   name,
//   developer,
//   publisher,
//   release_date,
//   image,
//   url,
//   price,
//   players,
//   positive,
//   negative,
//   timestamp
// }
//
//--------------------------------------------------
//
// ERROR HANDLING:
// - Nếu API fail → return null
// - Không crash server
//
// Đây là "data aggregator" chính của hệ thống
//
//======================================================================
// 5. DATA PERSISTENCE (FIRESTORE)
//======================================================================
//
// saveGameStatic(game):
// → set() document games/{appid} CHỈ KHI chưa tồn tại
// → chỉ lưu 1 lần (tương đương INSERT OR IGNORE)
//
//--------------------------------------------------
//
// saveGameHistory(game):
// → add() document mới vào subcollection games/{appid}/history
// → đồng thời merge cache giá trị mới nhất lên document games/{appid}
//
//--------------------------------------------------
//
// Pattern:
// static data → lưu 1 lần
// dynamic data → lưu liên tục + cache giá trị mới nhất
//
//======================================================================
// 6. INITIAL DATA SEEDING
//======================================================================
//
// initialFetch()
//
// Trigger:
// - Khi server start
// - Nếu collection "games" chưa có document nào
//
//--------------------------------------------------
//
// Logic:
//
// - Chia batch (5 game/lần)
// - Fetch song song trong batch
// - Delay 700ms giữa batch
//
//--------------------------------------------------
//
// Mục đích:
// - Tránh rate limit Steam
// - Load dữ liệu ban đầu
//
// Nếu không có bước này → chart sẽ rỗng
//
//======================================================================
// 7. REALTIME DATA UPDATE
//======================================================================
//
// updateGameData(appid)
//
// - Fetch:
//   + players
//   + price
//   + reviews
//
// - Ghi vào subcollection games/{appid}/history
// - Cập nhật cache trên document games/{appid}
//
//--------------------------------------------------
//
// updateAllGames()
//
// - Lặp toàn bộ document trong collection "games"
// - Gọi updateGameData()
// - Delay 400ms mỗi game
//
//--------------------------------------------------
//
// Tạo "data stream" theo thời gian
//
//======================================================================
// 8. CRON JOB (AUTO UPDATE)
//======================================================================
//
// cron.schedule("*/60 * * * *")
//
// → Chạy mỗi 60 phút
//
//--------------------------------------------------
//
// Flow:
//
// - Trigger updateAllGames()
// - Update toàn bộ dataset
//
//--------------------------------------------------
//
// NOTE:
// - Polling-based (không realtime thật)
// - Mỗi lần update tốn số lượt đọc/ghi Firestore tương ứng
//   → cần lưu ý free tier quota nếu scale lớn
//
//======================================================================
// 9. API ENDPOINTS (PUBLIC)
//======================================================================
//
//--------------------------------------------------
// GET /games
//--------------------------------------------------
//
// → Trả về toàn bộ document trong collection "games"
//   (đã có sẵn giá mới nhất nhờ cache, không cần JOIN)
//
//--------------------------------------------------
// GET /players/:appid
//--------------------------------------------------
//
// → Trả về lịch sử players (max 100 record) từ subcollection history
//
//--------------------------------------------------
// GET /price/:appid
//--------------------------------------------------
//
// → Lịch sử giá
//
//--------------------------------------------------
// GET /reviews/:appid
//--------------------------------------------------
//
// → Lịch sử review
//
//--------------------------------------------------
// GET /top-games
//--------------------------------------------------
//
// → Top 3 game nhiều player nhất (orderBy players desc, limit 3)
//
//--------------------------------------------------
// GET /ranking
//--------------------------------------------------
//
// → Top 10 game theo players
//
//--------------------------------------------------
// GET /ping
//--------------------------------------------------
//
// → Health check (server alive)
//
//======================================================================
// 10. AUTH SYSTEM (BASIC)
//======================================================================
//
// POST /register
// → tạo user (doc id = username → tự chặn trùng username)
//
// POST /login
// → kiểm tra username + password
//
// GET /check-user
// → check username tồn tại
//
// POST /reset-password
// → reset password theo email
//
//--------------------------------------------------
//
// SECURITY LIMITATIONS:
//
// Không hash password
// Không JWT / session
// Không rate limit
//
// Chỉ phù hợp demo / local
//
//======================================================================
// 11. SERVER START LOGIC
//======================================================================
//
// app.listen(PORT)
//
// Flow:
//
// - Start server
// - Kiểm tra collection "games":
//
//   IF rỗng:
//     → chạy initialFetch()
//
//--------------------------------------------------
//
// Đảm bảo hệ thống luôn có data
//
//======================================================================
// 12. DATA FLOW (END-TO-END)
//======================================================================
//
// Steam API
//    ↓
// fetchFullGameData()
//    ↓
// saveGameStatic + saveGameHistory
//    ↓
// Firestore
//    ↓
// Express API
//    ↓
// Frontend fetch()
//    ↓
// Chart / UI render
//
//======================================================================
// END OF BACKEND DOCUMENTATION
//======================================================================

/* ================= DATABASE (FIREBASE FIRESTORE) ================= */
//
// Cách lấy chiakhoaphucvufreefire.json:
// Firebase Console → Project Settings → Service Accounts
// → Generate new private key → tải file JSON về
// → đặt cùng thư mục với server.js, đặt tên "chiakhoaphucvufreefire.json"
// → KHÔNG commit file này lên git (thêm vào .gitignore)
//
// Nếu chạy trên môi trường đã có GOOGLE_APPLICATION_CREDENTIALS
// (Cloud Run, Cloud Functions...) có thể bỏ qua file JSON và dùng
// admin.credential.applicationDefault() thay thế.

const serviceAccount = JSON.parse(
    readFileSync(new URL("./chiakhoaphucvufreefire.json", import.meta.url))
);

const firebaseApp = initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore(firebaseApp);
const gamesCol = db.collection("games");
const usersCol = db.collection("users");

/* ================= GAME LIST ================= */

const APPIDS = [
    570, 730, 440, 1172470, 3240220, 359550, 381210, 252490,
    105600, 1281930, 457140, 275850, 881100, 3241660, 1623730,
    230290, 2050650, 601150, 264710, 848450, 367520, 391540,
    322330, 1726400, 2456350, 322170, 1671210, 413150, 1332010,
    1868140, 268910, 1390350, 7620, 236390, 2527500, 1289310,
    3557620, 438100, 431960, 1229490, 470220, 620, 1089980,
    531510, 2358720, 3564740, 2868840, 2507950, 314650, 220200,
    242051, 420530, 774181, 1237970, 550, 246620, 312520, 648800, 463530,
    4000, 2950790, 4080220, 3224770, 1121640, 5072600, 346110,
];

const uniqueAppIds = [...new Set(APPIDS)];

/* ================= HELPER ================= */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================= STEAM FETCH ================= */

async function fetchFullGameData(appid) {

    const detailUrl =
        `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`;

    const reviewUrl =
        `https://store.steampowered.com/appreviews/${appid}?json=1`;

    const playerUrl =
        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`;

    try {

        const [detailRes, reviewRes, playerRes] = await Promise.all([
            fetch(detailUrl),
            fetch(reviewUrl),
            fetch(playerUrl)
        ]);

        const detailJson = await detailRes.json();
        const reviewJson = await reviewRes.json();
        const playerJson = await playerRes.json();

        const data = detailJson[String(appid)]?.data;
        if (!data) return null;

        const summary = reviewJson.query_summary || {};

        return {

            appid,

            name: data.name,

            developer: data.developers?.join(", ") || "Unknown",

            publisher: data.publishers?.join(", ") || "Unknown",

            release_date: data.release_date?.date || "Unknown",

            image: data.header_image,

            url: `https://store.steampowered.com/app/${appid}`,

            price: data.is_free
                ? 0
                : (data.price_overview ? data.price_overview.final / 100 : null),

            players: playerJson?.response?.player_count || 0,

            positive: summary.total_positive || 0,

            negative: summary.total_negative || 0,

            timestamp: Date.now()

        };

    } catch (err) {

        console.error("Steam fetch error:", appid, err);
        return null;

    }

}

/* ================= SAVE DATA (FIRESTORE) ================= */

async function saveGameStatic(game) {

    const ref = gamesCol.doc(String(game.appid));
    const snap = await ref.get();

    // Tương đương INSERT OR IGNORE: chỉ ghi nếu document chưa tồn tại
    if (!snap.exists) {

        await ref.set({
            appid: game.appid,
            name: game.name,
            developer: game.developer,
            publisher: game.publisher,
            release_date: game.release_date,
            image: game.image,
            url: game.url
        });

    }

}

async function saveGameHistory(game) {
    const ref = gamesCol.doc(String(game.appid));
    let price = game.price;
    if (price === null) {
        const prevSnap = await ref.get();
        const prevPrice = prevSnap.exists ? prevSnap.data().price : null;
        price = typeof prevPrice === "number" ? prevPrice : null;
    }
    await ref.collection("history").add({
        timestamp: game.timestamp, price,
        players: game.players, positive: game.positive, negative: game.negative
    });
    await ref.set({
        price, players: game.players, positive: game.positive,
        negative: game.negative, updatedAt: game.timestamp
    }, { merge: true });
}

/* ================= INITIAL FETCH ================= */

async function initialFetch() {

    console.log("Fetching initial Steam data...");

    const batchSize = 5;

    for (let i = 0; i < uniqueAppIds.length; i += batchSize) {

        const batch = uniqueAppIds.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(id => fetchFullGameData(id))
        );

        for (const game of results) {

            if (game) {

                await saveGameStatic(game);
                await saveGameHistory(game);

                console.log("Saved:", game.name);

            }

        }

        console.log(`Progress ${i + batch.length}/${uniqueAppIds.length}`);

        await sleep(700); // tránh rate limit Steam

    }

    console.log("Initial fetch complete");

}

/* ================= UPDATE PLAYERS + PRICE ================= */

async function fetchNewGames() {

    const snapshot = await gamesCol.select().get(); // chỉ lấy id document, không cần đọc field
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));

    const newIds = uniqueAppIds.filter(id => !existingIds.has(String(id)));

    if (newIds.length === 0) {
        console.log("Không có appid mới nào trong APPIDS cần thêm.");
        return;
    }

    console.log(`Phát hiện ${newIds.length} appid mới:`, newIds);

    const batchSize = 5;

    for (let i = 0; i < newIds.length; i += batchSize) {

        const batch = newIds.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(id => fetchFullGameData(id))
        );

        for (const game of results) {

            if (game) {
                await saveGameStatic(game);
                await saveGameHistory(game);
                console.log("Đã thêm game mới:", game.name);
            }

        }

        await sleep(700); // tránh rate limit Steam

    }

    console.log("Đã thêm xong các game mới.");

}

async function updateGameData(appid) {

    try {

        const playerRes = await fetch(
            `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`
        );

        const playerJson = await playerRes.json();

        const players = playerJson?.response?.player_count || 0;

        const priceRes = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`
        );

        const priceJson = await priceRes.json();

        const data = priceJson[String(appid)]?.data;

        const price = data?.price_overview
            ? data.price_overview.final / 100
            : 0;
        const reviewRes = await fetch(
            `https://store.steampowered.com/appreviews/${appid}?json=1`
        );

        const reviewJson = await reviewRes.json();

        const positive =
            reviewJson.query_summary?.total_positive || 0;

        const negative =
            reviewJson.query_summary?.total_negative || 0;

        const timestamp = Date.now();

        const ref = gamesCol.doc(String(appid));

        await ref.collection("history").add({
            timestamp, price, players, positive, negative
        });

        await ref.set({
            price, players, positive, negative, updatedAt: timestamp
        }, { merge: true });

        console.log(`Updated ${appid} players:${players}`);

    } catch (err) {

        console.error("Update error:", err);

    }

}

async function updateAllGames() {

    const snapshot = await gamesCol.get();

    for (const doc of snapshot.docs) {

        await updateGameData(doc.data().appid);

        await sleep(400);

    }

    console.log("Update cycle complete");

}

/* ================= API ================= */

app.get("/games", async (req, res) => {

    try {

        const snapshot = await gamesCol.orderBy("name").get();

        const rows = snapshot.docs.map(doc => doc.data());

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.get("/price/:appid", async (req, res) => {

    try {

        const snapshot = await gamesCol.doc(req.params.appid)
            .collection("history")
            .orderBy("timestamp", "desc") // lấy 100 bản ghi MỚI NHẤT (trước đây lấy 100 bản ghi CŨ NHẤT)
            .limit(100)
            .get();

        const rows = snapshot.docs
            .map(doc => {
                const d = doc.data();
                return { timestamp: d.timestamp, price: d.price };
            })
            .reverse(); // đảo lại về thứ tự thời gian tăng dần cho biểu đồ

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.get("/reviews/:appid", async (req, res) => {

    try {

        const snapshot = await gamesCol.doc(req.params.appid)
            .collection("history")
            .orderBy("timestamp", "desc") // lấy 100 bản ghi MỚI NHẤT (trước đây lấy 100 bản ghi CŨ NHẤT)
            .limit(100)
            .get();

        const rows = snapshot.docs
            .map(doc => {
                const d = doc.data();
                return {
                    timestamp: d.timestamp,
                    positive: d.positive,
                    negative: d.negative
                };
            })
            .reverse(); // đảo lại về thứ tự thời gian tăng dần cho biểu đồ

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.get("/top-games", async (req, res) => {

    try {

        const snapshot = await gamesCol
            .orderBy("players", "desc")
            .limit(3)
            .get();

        const rows = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                appid: d.appid,
                name: d.name,
                image: d.image,
                url: d.url,
                players: d.players,
                price: d.price
            };
        });

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.get("/ranking", async (req, res) => {

    try {

        const snapshot = await gamesCol
            .orderBy("players", "desc")
            .limit(10)
            .get();

        const rows = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                appid: d.appid,
                name: d.name,
                image: d.image,
                players: d.players
            };
        });

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

/* ================= CRON UPDATE ================= */

cron.schedule("*/60 * * * *", async () => {

    console.log("Running scheduled Steam update...");

    await updateAllGames();

});

/* ================= START SERVER ================= */

app.listen(PORT, async () => {

    console.log(`Server running: http://localhost:${PORT}`);

    const snapshot = await gamesCol.limit(1).get();

    if (snapshot.empty) {
        await initialFetch();
    } else {
        await fetchNewGames();
    }

});


app.post("/register", async (req, res) => {

    const { email, username, password } = req.body;

    if (!email || !username || !password) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {

        const ref = usersCol.doc(username);
        const snap = await ref.get();

        if (snap.exists) {
            return res.status(400).json({ error: "Username exists" });
        }

        await ref.set({ email, username, password });

        res.json({ success: true });

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.post("/login", async (req, res) => {

    const { username, password } = req.body;

    try {

        const snap = await usersCol.doc(username).get();

        if (!snap.exists || snap.data().password !== password) {
            return res.status(401).json({ error: "Sai tài khoản" });
        }

        res.json({ username: snap.data().username });

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.get("/check-user", async (req, res) => {

    try {

        const snap = await usersCol.doc(req.query.username).get();

        res.json({ exists: snap.exists });

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.get("/ping", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/players/:appid", async (req, res) => {

    try {

        const snapshot = await gamesCol.doc(req.params.appid)
            .collection("history")
            .orderBy("timestamp", "desc") // lấy 100 bản ghi MỚI NHẤT (trước đây lấy 100 bản ghi CŨ NHẤT)
            .limit(100)
            .get();

        const rows = snapshot.docs
            .map(doc => {
                const d = doc.data();
                return { timestamp: d.timestamp, players: d.players };
            })
            .reverse(); // đảo lại về thứ tự thời gian tăng dần cho biểu đồ

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});

app.post("/reset-password", async (req, res) => {

    const { username, email, newPassword } = req.body;

    if (!username || !email || !newPassword) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {

        const ref = usersCol.doc(username);
        const snap = await ref.get();

        if (!snap.exists || snap.data().email !== email) {
            return res.status(400).json({ error: "Sai thông tin" });
        }

        await ref.update({ password: newPassword });

        res.json({ success: true });

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Server error" });

    }

});