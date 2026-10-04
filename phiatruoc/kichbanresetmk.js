const API = "http://localhost:3000";
// Backend endpoint

const showBtn = document.getElementById("show");
const passwordInput = document.getElementById("password");

/* ================= TOGGLE ================= */
// Hiện / ẩn password
showBtn.addEventListener("click", () => {

    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";
});

/* ================= HASH ================= */
// Hash password mới trước khi gửi
async function hashPassword(password) {

    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);

    return [...new Uint8Array(hash)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/* ================= RESET ================= */
document.getElementById("resetForm").addEventListener("submit", async e => {

    e.preventDefault(); // ❗ chặn reload

    // Lấy dữ liệu input
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {

        // Hash password mới
        const hashed = await hashPassword(password);

        // Gửi request reset password
        const res = await fetch(`${API}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({
                username,
                email,
                newPassword: hashed
            })
        });

        const data = await res.json();

        // Nếu server trả lỗi
        if (!res.ok) throw new Error(data.error);

        // Thành công
        alert("Đổi mật khẩu thành công!");

        // Redirect về login
        location.href = "dangnhap1.html";

    } catch (err) {

        console.error(err);

        alert("Sai thông tin hoặc lỗi server!");
    }
});