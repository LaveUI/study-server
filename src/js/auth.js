async function handleGoogleLogin(response) {
  try {
    const API = window.location.port === "5500" ? "http://localhost:5000" : window.location.origin;
    const res = await fetch(API + "/auth/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        credential: response.credential,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.token) {
      alert("Login failed");
      return;
    }

    // ✅ store BOTH token and user
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    alert("Something went wrong during login");
  }
}

async function handleGuestLogin() {
  try {
    const API = window.location.port === "5500" ? "http://localhost:5000" : window.location.origin;
    const res = await fetch(API + "/auth/guest", {
      method: "POST"
    });

    const data = await res.json();

    if (!res.ok || !data.token) {
      alert("Guest login failed");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    alert("Something went wrong during guest login");
  }
}
