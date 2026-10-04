    const API = "http://localhost:3000";
    // Backend URL

    const showBtn = document.getElementById("show");
    const passwordInput = document.getElementById("password");
    const loginForm = document.getElementById("loginForm");

    /* ================= TOGGLE PASSWORD ================= */
    // Hiện / ẩn password
    showBtn.addEventListener("click", () => {

      const isHidden = passwordInput.type === "password";

      // Toggle giữa password ↔ text
      passwordInput.type = isHidden ? "text" : "password";
    });

    /* ================= HASH ================= */
    // Hash giống bên register để đảm bảo so sánh đúng DB
    async function hashPassword(password) {

      const data = new TextEncoder().encode(password);
      const hash = await crypto.subtle.digest("SHA-256", data);

      return [...new Uint8Array(hash)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    }

    /* ================= LOGIN ================= */
    loginForm.addEventListener("submit", async e => {

      e.preventDefault(); // không reload

      try {

        const username = document.getElementById("username").value.trim();

        // Hash password trước khi gửi
        const password = await hashPassword(passwordInput.value);

        // Gửi request login
        const res = await fetch(`${API}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        // Nếu sai tài khoản hoặc lỗi
        if (!res.ok) throw new Error(data.error);

        // Lưu user vào localStorage (giả session)
        localStorage.setItem("CurrentUser", data.username);

        // Login thành công
        alert("Đăng nhập thành công!");

        // Redirect vào trang chính
        location.href = "main.html";

      } catch (err) {

        console.error(err);

        alert("Sai tài khoản hoặc lỗi server!");
      }
    });