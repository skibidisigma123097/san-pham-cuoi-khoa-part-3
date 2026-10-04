/* ================= FIREBASE (FIRESTORE) ================= */
// Đọc dữ liệu game trực tiếp từ Firestore — dữ liệu do backend
// phiasau/maychu/js/server.js ghi lên (collection "games", subcollection "history").
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const gamesCol = collection(db, "games");

/* ================= FIRESTORE HELPERS ================= */
// Thay cho hàm api() gọi REST cũ

async function fetchGames() {
    const snap = await getDocs(query(gamesCol, orderBy("name")));
    return snap.docs.map(d => d.data());
}

async function fetchTopGames(n = 3) {
    const snap = await getDocs(query(gamesCol, orderBy("players", "desc"), limit(n)));
    return snap.docs.map(d => {
        const g = d.data();
        return { appid: g.appid, name: g.name, image: g.image, url: g.url, players: g.players, price: g.price };
    });
}

async function fetchRanking(n = 10) {
    const snap = await getDocs(query(gamesCol, orderBy("players", "desc"), limit(n)));
    return snap.docs.map(d => {
        const g = d.data();
        return { appid: g.appid, name: g.name, image: g.image, players: g.players };
    });
}

// BUG-FIX (mất dữ liệu mới sau ~4 ngày): orderBy("timestamp","asc") lấy
// 100 bản ghi CŨ NHẤT. Cron chạy mỗi giờ → sau 100 giờ (~4 ngày) biểu đồ
// đứng im mãi ở dữ liệu cũ. Đổi sang "desc" để luôn lấy 100 bản ghi MỚI
// NHẤT, rồi .reverse() lại thành thứ tự cũ→mới cho Chart.js vẽ đúng chiều.
//
// BUG-FIX (tốn quota Firestore): trước đây fetchPlayers/fetchPrice/fetchReviews
// của CÙNG 1 appid mỗi cái tự gọi getDocs() riêng — loadChart() gọi cả 3 cho
// cùng 1 game nghĩa là đọc collection "history" 3 lần cho cùng 1 dữ liệu.
// Cache ngắn hạn (2s) dưới đây gộp các lệnh gọi liền nhau lại thành 1 lượt đọc.
const historyCache = new Map(); // appid -> { time, promise }
const HISTORY_CACHE_MS = 2000;

function fetchHistoryRaw(appid) {
    const cached = historyCache.get(appid);
    if (cached && Date.now() - cached.time < HISTORY_CACHE_MS) {
        return cached.promise;
    }
    const historyCol = collection(db, "games", String(appid), "history");
    const promise = getDocs(query(historyCol, orderBy("timestamp", "desc"), limit(100)))
        .then(snap => snap.docs.map(d => d.data()).reverse());
    historyCache.set(appid, { time: Date.now(), promise });
    return promise;
}

function fetchPlayers(appid) {
    return fetchHistoryRaw(appid).then(rows => rows.map(d => ({ timestamp: d.timestamp, players: d.players })));
}

function fetchPrice(appid) {
    return fetchHistoryRaw(appid).then(rows => rows.map(d => ({ timestamp: d.timestamp, price: d.price })));
}

function fetchReviews(appid) {
    return fetchHistoryRaw(appid).then(rows => rows.map(d => ({ timestamp: d.timestamp, positive: d.positive, negative: d.negative })));
}

/* ================= STATE ================= */

const carouselInner = document.getElementById("carouselInner");
let currentTab = "players";
let currentAppId = null;
let reviewChart = null;
let allGames = [];
let playersChart = null;
let priceChart = null;
const API_BASE = "http://localhost:3000"; // vẫn dùng cho đăng nhập/health-check, không dùng để lấy dữ liệu game nữa
let visibleGames = [];
let currentIndex = 0;
const LOAD_COUNT = 12;
let reviewChart1 = null;
let reviewChart2 = null;

const searchInput = document.getElementById("searchInput");
const dropdown = document.getElementById("searchDropdown");
const container = document.getElementById("gamecontainer");

/* ================= USER LOGIN ================= */

const currentUser = localStorage.getItem("CurrentUser");

if (!currentUser) {
    alert("Bạn cần đăng nhập!");
    window.location.href = "dangnhap1.html";
}

document.getElementById("usernameDisplay").textContent = currentUser;

document.getElementById("userAvatar").src =
    "https://ui-avatars.com/api/?name=" + encodeURIComponent(currentUser);

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("CurrentUser");
    window.location.href = "dangnhap1.html";
});


/* ================= LOAD GAME LIST ================= */

async function loadGames() {
    try {
        allGames = await fetchGames();
        displayGames(allGames);
        populateGameSelect();
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", () => {

    loadGames();
    loadTopCarousel();
    showHome();

});


/* ================= DISPLAY GAME ================= */

function displayGames(games, reset = true) {

    if (reset) {
        container.innerHTML = "";
        visibleGames = games;
        currentIndex = 0;
    }

    const nextGames = visibleGames.slice(currentIndex, currentIndex + LOAD_COUNT);

    nextGames.forEach(game => {

        const card = `
<div class="game-card" onclick="window.open('${game.url}', '_blank')">

    <div class="img-wrapper">
        <img src="${game.image}" alt="${game.name}">
        <div class="card-overlay">
            <span></span>
        </div>
    </div>

    <div class="game-info">
        <div class="game-title">${game.name}</div>
        <div class="game-price">
  ${game.price > 0 ? "$" + game.price : "Free"}
</div>

</div>
`;

        container.insertAdjacentHTML("beforeend", card);

    });

    currentIndex += LOAD_COUNT;

}


/* ================= SEARCH ================= */

/* ================= SEARCH ================= */

const RICKROLL_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1";
const RICKROLL_TRIGGERS = ["nevergonnagiveyouup", "rickroll"];
const admin_page = "admin.html";

// Easter egg: Konami code (↑ ↑ ↓ ↓ ← → ← → B A) mở trang admin.
// Lắng nghe keydown trên toàn trang (không phụ thuộc ô tìm kiếm).
const KONAMI_CODE = [
    "ArrowUp", "ArrowUp",
    "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight",
    "ArrowLeft", "ArrowRight",
    "b", "a"
];

// Dùng thuật toán KMP thay vì "gõ sai thì reset về 0": Konami code có 2
// phím ArrowUp liền nhau ở đầu, nên cách reset đơn giản có thể BỎ SÓT
// chuỗi đúng nằm gối lên phần gõ nhầm ngay trước đó (mình đã tự kiểm
// chứng bị lỗi này bằng test tự động trước khi chọn cách làm dưới đây).
function buildFailureTable(pattern) {
    const table = [0];
    let len = 0, i = 1;
    while (i < pattern.length) {
        if (pattern[i] === pattern[len]) {
            table[i++] = ++len;
        } else if (len > 0) {
            len = table[len - 1];
        } else {
            table[i++] = 0;
        }
    }
    return table;
}
const KONAMI_FAILURE = buildFailureTable(KONAMI_CODE);
let konamiIndex = 0;

document.addEventListener("keydown", (e) => {

    // Bấm Shift để gõ chữ hoa (Shift+B) tự bắn thêm 1 sự kiện keydown
    // riêng cho chính phím Shift TRƯỚC sự kiện của phím B — nếu không bỏ
    // qua, phím Shift bị tính như 1 ký tự sai, làm lệch bộ đếm.
    if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;

    // Phím mũi tên giữ nguyên e.key; phím chữ 1 ký tự (b, a) chuẩn hoá
    // về chữ thường để không phân biệt hoa/thường (Shift+B vẫn tính).
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    while (konamiIndex > 0 && key !== KONAMI_CODE[konamiIndex]) {
        konamiIndex = KONAMI_FAILURE[konamiIndex - 1];
    }

    if (key === KONAMI_CODE[konamiIndex]) {
        konamiIndex++;
    }

    if (konamiIndex === KONAMI_CODE.length) {
        konamiIndex = 0;
        window.open(admin_page, "_blank");
    }

});

searchInput.addEventListener("input", function () {

    const keyword = this.value.toLowerCase();
    const normalized = keyword.replace(/\s+/g, "");
    if (RICKROLL_TRIGGERS.includes(normalized)) {

        dropdown.style.display = "none";
        window.open(RICKROLL_URL, "_blank");

        this.value = "";
        displayGames(allGames);
        return;

    }

    if (!keyword) {

        dropdown.style.display = "none";
        displayGames(allGames);
        return;

    }

    const filtered = allGames.filter(game =>
        game.name.toLowerCase().includes(keyword)
    );

    displayGames(filtered);

    // BUG-FIX: tên game có dấu nháy đơn (VD: "Don't Starve Together")
    // từng làm hỏng chuỗi onclick="selectGame('${game.name}', ...)" →
    // báo lỗi "missing ) after argument list" và toàn bộ script phía
    // sau ngừng chạy. Dựng phần tử bằng DOM + textContent (thay vì nhét
    // tên game vào một chuỗi HTML/JS) để không phụ thuộc ký tự trong tên.
    dropdown.innerHTML = "";

    if (!filtered.length) {

        const empty = document.createElement("div");
        empty.className = "search-item text-muted";
        empty.textContent = "Không tìm thấy game phù hợp";
        dropdown.appendChild(empty);

    } else {

        filtered.slice(0, 5).forEach(game => {

            const item = document.createElement("div");
            item.className = "search-item";

            const img = document.createElement("img");
            img.src = game.image;

            const span = document.createElement("span");
            span.textContent = game.name;

            item.append(img, span);
            item.addEventListener("click", () => selectGame(game.appid));

            dropdown.appendChild(item);

        });

    }

    dropdown.style.display = "block";

});


function selectGame(appid) {

    // Tra theo appid thay vì lọc lại theo tên: chính xác tuyệt đối
    // (trước đây lọc theo tên có thể khớp nhầm nhiều game cùng lúc).
    const game = allGames.find(g => g.appid == appid);
    if (!game) return;

    searchInput.value = game.name;

    displayGames([game]);

    dropdown.style.display = "none";

    loadChart(appid);

}

function showAnalytics() {

    document.getElementById("analyticsSection").style.display = "block";

    window.scrollTo({
        top: document.getElementById("analyticsSection").offsetTop - 50,
        behavior: "smooth"
    });

}

function populateGameSelect() {

    const select1 = document.getElementById("gameSelect1");
    const select2 = document.getElementById("gameSelect2");

    select1.innerHTML = "";
    select2.innerHTML = "";

    allGames.forEach(game => {

        const option =
            `<option value="${game.appid}">${game.name}</option>`;

        select1.insertAdjacentHTML("beforeend", option);
        select2.insertAdjacentHTML("beforeend", option);

    });

    // BUG-FIX (trang Phân Tích trống khi mở lần đầu): trước đây cả 2 ô chọn
    // đều mặc định cùng 1 game, và chỉ loadChart() (1 dataset) được gọi —
    // biểu đồ so sánh + 2 pie chart đánh giá chỉ xuất hiện SAU khi người
    // dùng tự đổi ô chọn thứ 2. Giờ chọn sẵn 2 game khác nhau và gọi luôn
    // compareGames() để mọi biểu đồ có dữ liệu ngay từ đầu.
    if (allGames.length > 0) {
        select1.value = allGames[0].appid;

        if (allGames.length > 1) {
            select2.value = allGames[1].appid;
        }

        compareGames();
    }

    select1.addEventListener("change", () => {
        loadChart(select1.value);
        compareGames();
    });

    select2.addEventListener("change", compareGames);

}

async function compareGames() {

    const appid1 = document.getElementById("gameSelect1").value;
    const appid2 = document.getElementById("gameSelect2").value;

    if (!appid1 || !appid2) return;

    const game1 = allGames.find(g => g.appid == appid1);
    const game2 = allGames.find(g => g.appid == appid2);

    // ===== FETCH =====
    const [p1, p2, pr1, pr2] = await Promise.all([
        fetchPlayers(appid1),
        fetchPlayers(appid2),
        fetchPrice(appid1),
        fetchPrice(appid2)
    ]);

    const labels = p1.map(d =>
        new Date(d.timestamp).toLocaleTimeString()
    );

    // ===== PLAYERS =====
    if (playersChart) playersChart.destroy();

    playersChart = new Chart(
        document.getElementById("playersChart"),
        {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: game1.name,
                        data: p1.map(d => d.players),
                        borderColor: "#4bc0c0",
                        tension: 0.3
                    },
                    {
                        label: game2.name,
                        data: p2.map(d => d.players),
                        borderColor: "#ff6384",
                        tension: 0.3
                    }
                ]
            }
        }
    );

    // ===== PRICE =====
    if (priceChart) priceChart.destroy();

    priceChart = new Chart(
        document.getElementById("priceChart"),
        {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: game1.name,
                        data: pr1.map(d => d.price),
                        borderColor: "#36a2eb",
                        tension: 0.3
                    },
                    {
                        label: game2.name,
                        data: pr2.map(d => d.price),
                        borderColor: "#ffce56",
                        tension: 0.3
                    }
                ]
            }
        }
    );

    // ===== REVIEWS =====
    updateCompareReview(appid1, appid2);
}

/* ================= CHART ================= */
async function loadChart(appid) {
    currentAppId = appid;

    try {

        const [playerData, priceData, reviewData] = await Promise.all([
            fetchPlayers(appid),
            fetchPrice(appid),
            fetchReviews(appid)
        ]);

        if (!reviewData?.length) return;

        const last = reviewData.at(-1);

        const positive = last.positive || 0;
        const negative = last.negative || 0;

        const total = positive + negative || 1;

        const posPercent = ((positive / total) * 100).toFixed(1);
        const negPercent = ((negative / total) * 100).toFixed(1);

        const playerLabels = playerData.map(d =>
            new Date(d.timestamp).toLocaleTimeString()
        );

        const playerValues = playerData.map(d => d.players);

        const priceLabels = priceData.map(d =>
            new Date(d.timestamp).toLocaleTimeString()
        );

        const priceValues = priceData.map(d => d.price);

        updatePlayersChart(playerLabels, playerValues);
        updatePriceChart(priceLabels, priceValues);

    } catch (err) {

        console.error("Chart load error:", err);

    }


    function updatePlayersChart(labels, data) {

        const ctx = document.getElementById("playersChart").getContext("2d");

        if (playersChart) {
            playersChart.data.labels = labels;
            playersChart.data.datasets[0].data = data;
            playersChart.update();
            return;
        }

        playersChart = new Chart(ctx, {

            type: "line",

            data: {
                labels,
                datasets: [{
                    label: "Players Online",
                    data,
                    borderColor: "#4bc0c0",
                    backgroundColor: "rgba(75,192,192,0.2)",
                    tension: 0.3
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false
            }

        });

    }

    function updatePriceChart(labels, data) {

        const ctx = document.getElementById("priceChart").getContext("2d");

        if (priceChart) {
            priceChart.data.labels = labels;
            priceChart.data.datasets[0].data = data;
            priceChart.update();
            return;
        }

        priceChart = new Chart(ctx, {

            type: "line",

            data: {
                labels,
                datasets: [{
                    label: "Price ($)",
                    data,
                    borderColor: "#ff6384",
                    backgroundColor: "rgba(255,99,132,0.2)",
                    tension: 0.3
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false
            }

        });

    }

}

async function refreshChart() {

    try {

        const appid1 = document.getElementById("gameSelect1")?.value;
        const appid2 = document.getElementById("gameSelect2")?.value;

        if (!appid1) return;

        // ===== PLAYERS =====
        if (currentTab === "players") {

            const [p1, p2] = await Promise.all([
                fetchPlayers(appid1),
                appid2 ? fetchPlayers(appid2) : null
            ]);

            const labels = p1.map(d =>
                new Date(d.timestamp).toLocaleTimeString()
            );
            if (!playersChart) return;

            playersChart.data.labels = labels;
            playersChart.data.datasets[0].data = p1.map(d => d.players);

            if (p2 && playersChart.data.datasets[1]) {
                playersChart.data.datasets[1].data = p2.map(d => d.players);
            };

            playersChart.update();
        }

        // ===== PRICE =====
        if (currentTab === "price") {

            const [pr1, pr2] = await Promise.all([
                fetchPrice(appid1),
                appid2 ? fetchPrice(appid2) : null
            ]);

            const labels = pr1.map(d =>
                new Date(d.timestamp).toLocaleTimeString()
            );
            if (!priceChart) return;

            priceChart.data.labels = labels;
            priceChart.data.datasets[0].data = pr1.map(d => d.price);

            if (pr2 && priceChart.data.datasets[1]) {
                priceChart.data.datasets[1].data = pr2.map(d => d.price);
            };

            priceChart.update();
        }

        // ===== REVIEWS =====
        if (currentTab === "reviews" && appid2) {

            const [r1, r2] = await Promise.all([
                fetchReviews(appid1),
                fetchReviews(appid2)
            ]);

            const last1 = r1.at(-1);
            const last2 = r2.at(-1);

            if (!last1 || !last2) return;

            reviewChart1.data.datasets[0].data = [
                last1.positive || 0,
                last1.negative || 0
            ];

            reviewChart2.data.datasets[0].data = [
                last2.positive || 0,
                last2.negative || 0
            ];

            reviewChart1.update();
            reviewChart2.update();
        }

        console.log("Realtime update:", new Date().toLocaleTimeString());

    } catch (err) {

        console.error("Refresh error:", err);

    }

}
/* ================= TAB SWITCH ================= */

function showChart(type) {

    currentTab = type;

    const players = document.getElementById("playersChart");
    const price = document.getElementById("priceChart");
    const review = document.getElementById("reviewChart");

    players.style.display = "none";
    price.style.display = "none";
    review.style.display = "none";

    if (type === "players") players.style.display = "block";
    if (type === "price") price.style.display = "block";
    if (type === "reviews") review.style.display = "flex";

    // BUG-FIX: nút tab đang sáng (.active) không đổi theo type — trước đây
    // showAnalyticsPage() mở sẵn tab "reviews" trong khi nút "Người chơi"
    // vẫn hiển thị là đang được chọn, gây lệch giữa nút bấm và nội dung.
    document.querySelectorAll("#analyticsSection .nav-tabs .nav-link").forEach(btn => {
        btn.classList.toggle(
            "active",
            btn.getAttribute("onclick")?.includes(`showChart('${type}')`)
        );
    });

}

function showHome() {

    document.getElementById("homeSection").style.display = "block";
    document.getElementById("ranking-section").style.display = "none";
    document.getElementById("analyticsSection").style.display = "none";

    container.style.display = "grid";

    window.scrollTo({ top: 0, behavior: "smooth" });

}

async function showRanking() {

    document.getElementById("homeSection").style.display = "none";
    document.getElementById("ranking-section").style.display = "block";
    document.getElementById("analyticsSection").style.display = "none";

    const body = document.getElementById("ranking-body");

    body.innerHTML = "<tr><td colspan='3'>Loading...</td></tr>";

    try {
        const data = await fetchRanking(10);

        body.innerHTML = "";

        data.forEach((game, i) => {

            let topClass = "";
            if (i === 0) topClass = "top-1";
            else if (i === 1) topClass = "top-2";
            else if (i === 2) topClass = "top-3";

            const row = `
<tr class="fade-in ${topClass}" style="animation-delay:${i * 0.05}s">

<td class="rank-number">
${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
</td>

<td style="display:flex; align-items:center;">
<img src="${game.image}" class="rank-img">
${game.name}
</td>

<td class="players">
${game.players.toLocaleString()}
</td>

</tr>
`;

            body.insertAdjacentHTML("beforeend", row);

        });

    } catch (err) {
        console.error("Ranking load error:", err);
        body.innerHTML = "<tr><td colspan='3'>Lỗi load dữ liệu</td></tr>";
    }
}

function showAnalyticsPage() {

    document.getElementById("homeSection").style.display = "none";
    document.getElementById("ranking-section").style.display = "none";
    document.getElementById("analyticsSection").style.display = "block";

    showChart("reviews");

}

const SERVER_URL = `${API_BASE}/ping`;

let serverLost = false;
let overlay = null;

async function checkServer() {

    try {

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 5000);

        const res = await fetch(SERVER_URL, {
            cache: "no-cache",
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!res.ok) throw new Error();

        if (serverLost) {

            showReconnect();
            serverLost = false;

            reloadCharts();

        }

    } catch {

        if (!serverLost) {
            showServerWarning();
            serverLost = true;
        }

    }

}

checkServer();
setInterval(checkServer, 10000);

// BUG-FIX (overlay chặn kín toàn màn hình sai chỗ): API_BASE (localhost:3000)
// chỉ còn dùng cho đăng nhập/health-check — toàn bộ dữ liệu game đã đọc
// thẳng từ Firestore (xem đầu file). Overlay cũ phủ kín 100% màn hình,
// chặn mọi thao tác, dù dữ liệu game vẫn hiển thị và hoạt động bình thường.
// Sau khi deploy, "localhost:3000" cũng không tồn tại với máy người dùng
// → overlay này sẽ hiện với TẤT CẢ mọi người, không chỉ khi server thật sự lỗi.
// Đổi thành banner nhỏ ở đầu trang, không chặn thao tác; bỏ nút "Exit"
// (từng điều hướng thẳng về "about:blank", không có tác dụng gì hữu ích).
function showServerWarning() {

    if (overlay) return; // tránh tạo nhiều popup

    overlay = document.createElement("div");

    // Không dùng position:fixed: trang này thanh menu (.topbar) đã nằm sẵn
    // ở đầu <body>, nếu banner "nổi" đè lên đó sẽ chặn luôn việc bấm vào
    // menu (đã kiểm chứng bị lỗi này khi thử position:fixed). Chèn banner
    // như một khối bình thường ở đầu body để đẩy nội dung xuống, không đè.
    overlay.innerHTML = `
<div id="serverWarningBanner" style="
width:100%;
z-index:9999;
background:#fff3cd;
color:#664d03;
border-bottom:1px solid #ffe69c;
padding:10px 16px;
display:flex;
flex-wrap:wrap;
align-items:center;
justify-content:center;
gap:12px;
font-size:14px;
text-align:center;
box-sizing:border-box;
">
<span>Mất kết nối server đăng nhập và tải dữ liệu. Dữ liệu game đã tải vẫn hiển thị bình thường.</span>
<button id="refreshBtn" style="padding:4px 12px; cursor:pointer;">Thử lại</button>
<button id="dismissBtn" style="padding:4px 12px; cursor:pointer;">Đóng</button>
</div>
`;

    document.body.insertBefore(overlay, document.body.firstChild);

    document.getElementById("refreshBtn").onclick = () => {
        location.reload();
    };

    document.getElementById("dismissBtn").onclick = () => {
        overlay.remove();
        overlay = null;
    };

}

function showReconnect() {

    if (!overlay) return;

    overlay.remove();
    overlay = null;

}


/* ================= EXPOSE TO GLOBAL SCOPE ================= */
// File này được nạp dạng <script type="module">, nên các hàm khai báo
// ở top-level KHÔNG tự động có trên window. Các thuộc tính onclick="..."
// trong main.html lại chạy ở global scope, nên phải gán thủ công như dưới đây,
// nếu không sẽ bị lỗi "xxx is not defined" khi bấm vào các tab/nút.
window.showHome = showHome;
window.showRanking = showRanking;
window.showAnalyticsPage = showAnalyticsPage;
window.showChart = showChart;
window.setActive = setActive;
window.selectGame = selectGame;

console.log("Page loaded:", new Date().toLocaleTimeString());

// (Đã bỏ đoạn debug ghi đè window.location.reload — module chạy ở strict mode
// nên phép gán đó luôn ném lỗi và làm dừng toàn bộ script phía sau, khiến
// infinite scroll và auto-refresh biểu đồ không bao giờ chạy được.)

function reloadCharts() {

    const select1 = document.getElementById("gameSelect1");

    if (select1?.value) {
        loadChart(select1.value);
    }

}

// BUG-FIX (tốn quota Firestore): dữ liệu chỉ đổi mỗi 60 phút (cron backend),
// nên refresh mỗi 10 giây là thừa — mỗi tab đang mở ở trang Phân Tích từng
// ngốn khoảng 65.000 lượt đọc/giờ, trong khi gói free Firestore chỉ có
// 50.000 lượt đọc/NGÀY. Giờ chỉ refresh mỗi 5 phút, và chỉ khi tab Phân Tích
// đang thực sự hiển thị (không refresh khi người dùng đang ở Trang chủ/Bảng xếp hạng).
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
    const analyticsVisible =
        document.getElementById("analyticsSection").style.display !== "none";

    if (analyticsVisible) refreshChart();
}, REFRESH_INTERVAL_MS);

let isLoading = false;

window.addEventListener("scroll", () => {
    const nearBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;

    if (nearBottom && !isLoading) {
        isLoading = true;

        if (currentIndex < visibleGames.length) {
            displayGames(visibleGames, false);
        }

        setTimeout(() => isLoading = false, 200);
    }
});

function setActive(el) {

    const links = document.querySelectorAll(".nav-animated .nav-link");

    links.forEach(link => link.classList.remove("active"));

    el.classList.add("active");

    moveUnderline(el);

}

function moveUnderline(el) {
    const nav = document.querySelector(".nav-animated");
    const rect = el.getBoundingClientRect();
    const parentRect = nav.getBoundingClientRect();

    const left = rect.left - parentRect.left;
    const width = rect.width;

    nav.style.setProperty("--bar-left", left + "px");
    nav.style.setProperty("--bar-width", width + "px");
}

window.addEventListener("load", () => {

    const active = document.querySelector(".nav-link.active");

    if (active) {
        moveUnderline(active);
    }

});

async function updateCompareReview(appid1, appid2) {

    const game1 = allGames.find(g => g.appid == appid1);
    const game2 = allGames.find(g => g.appid == appid2);

    const [r1, r2] = await Promise.all([
        fetchReviews(appid1),
        fetchReviews(appid2)
    ]);

    const last1 = r1.at(-1);
    const last2 = r2.at(-1);

    if (!last1 || !last2) return;

    document.getElementById("reviewTitle1").innerText = game1.name;
    document.getElementById("reviewTitle2").innerText = game2.name;

    const data1 = [last1.positive || 0, last1.negative || 0];
    const data2 = [last2.positive || 0, last2.negative || 0];

    if (reviewChart1) reviewChart1.destroy();
    if (reviewChart2) reviewChart2.destroy();

    reviewChart1 = new Chart(
        document.getElementById("reviewChart1"),
        {
            type: "pie",
            data: {
                labels: ["Positive", "Negative"],
                datasets: [{
                    data: data1,
                    backgroundColor: ["#4caf50", "#f44336"]
                }]
            }
        }
    );

    reviewChart2 = new Chart(
        document.getElementById("reviewChart2"),
        {
            type: "pie",
            data: {
                labels: ["Positive", "Negative"],
                datasets: [{
                    data: data2,
                    backgroundColor: ["#4caf50", "#f44336"]
                }]
            }
        }
    );
}

async function loadTopCarousel() {
    try {
        const games = await fetchTopGames(3);

        carouselInner.innerHTML = "";

        games.forEach((g, i) => {
            carouselInner.insertAdjacentHTML("beforeend", `
                <div class="carousel-item ${i === 0 ? "active" : ""}">
                    
                    <div class="carousel-click"
                         onclick="window.open('${g.url}', '_blank')">

                        <img src="${g.image}" class="d-block w-100 carousel-img">

                        <div class="carousel-overlay"></div>

                        <div class="carousel-caption custom-caption">
                            <h2>${g.name}</h2>
                            <p class="players-now">
                             ${g.players?.toLocaleString() || "N/A"} players
                            </p>
                            <p class="carousel-price">
        ${g.price ? "$" + g.price : "Free"}
    </p>
                        </div>

                    </div>

                </div>
            `);
        });

    } catch (err) {
        console.error(err);
    }
}