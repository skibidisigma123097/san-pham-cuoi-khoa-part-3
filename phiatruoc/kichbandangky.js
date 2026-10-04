const API = "http://localhost:3000";
//  Base URL backend (Express server)
// Tất cả request sẽ đi qua đây

/* ================= PASSWORD TOGGLE ================= */
//  Lấy tất cả nút có class .toggle-password (có thể có nhiều input)
document.querySelectorAll(".toggle-password").forEach(btn => {

    // Gắn sự kiện click cho từng nút
    btn.addEventListener("click", () => {

        // dataset.target = id của input (VD: password1, password2)
        // → giúp 1 nút control đúng input tương ứng
        const input = document.getElementById(btn.dataset.target);

        // Kiểm tra trạng thái hiện tại:
        // - password → đang ẩn
        // - text → đang hiện
        const isHidden = input.type === "password";

        // Toggle:
        // nếu đang ẩn → chuyển sang hiện (text)
        // nếu đang hiện → chuyển lại password
        input.type = isHidden ? "text" : "password";

        // Đổi icon mắt cho UX:
        // eye-slash = đang hiện
        // eye = đang ẩn
        btn.innerHTML = isHidden
            ? '<i class="fa-solid fa-eye-slash"></i>'
            : '<i class="fa-solid fa-eye"></i>';
    });
});

/* ================= HASH ================= */
//  Hash password bằng SHA-256 trước khi gửi lên server
// → tránh gửi plain text (dù vẫn chưa đủ secure production)
async function hashPassword(password) {

    // Convert string → binary (ArrayBuffer)
    const data = new TextEncoder().encode(password);

    // Dùng Web Crypto API để hash
    const hash = await crypto.subtle.digest("SHA-256", data);

    // Convert binary → hex string (dạng lưu trữ phổ biến)
    return [...new Uint8Array(hash)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/* ================= VALIDATION ================= */
//  Validate input trước khi gửi API
function validate(email, pass1, pass2) {

    // Regex email cơ bản:
    // - có ký tự trước @
    // - có domain
    if (!/^\S+@\S+\.\S+$/.test(email))
        return "Email không hợp lệ";

    // Password nhập lại phải khớp
    if (pass1 !== pass2)
        return "Mật khẩu không khớp";

    // null = hợp lệ
    return null;
}

/* ================= SUBMIT ================= */
// Bắt sự kiện submit form
document.getElementById("SignupForm").addEventListener("submit", async e => {

    e.preventDefault();
    // ❗ Ngăn form reload trang (SPA behavior)

    // Lấy dữ liệu từ input
    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const pass1 = document.getElementById("password1").value;
    const pass2 = document.getElementById("password2").value;

    // Validate trước khi gọi server
    const error = validate(email, pass1, pass2);
    if (error) return alert(error);

    try {

        // Gọi API kiểm tra username tồn tại chưa
        const check = await fetch(`${API}/check-user?username=${username}`)
            .then(r => r.json());

        // Nếu tồn tại → chặn đăng ký
        if (check.exists) return alert("Username đã tồn tại");

        // Hash password (client-side)
        const password = await hashPassword(pass1);

        // Gửi request đăng ký
        const res = await fetch(`${API}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },

            // Body gửi JSON lên server
            body: JSON.stringify({ email, username, password })
        });

        const data = await res.json();

        // Nếu server trả lỗi (400, 500...)
        if (!res.ok) throw new Error(data.error);

        // Thành công
        alert("Đăng ký thành công!");

        // Redirect sang login
        location.href = "dangnhap1.html";

    } catch (err) {

        // Log chi tiết để debug
        console.error(err);

        alert("Lỗi server!");
    }
});