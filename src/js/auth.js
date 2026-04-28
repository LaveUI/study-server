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

    const redirectUrl = localStorage.getItem("redirectAfterLogin");
    if (redirectUrl) {
      localStorage.removeItem("redirectAfterLogin");
      window.location.href = redirectUrl;
    } else {
      window.location.href = "/pages/dashboard.html";
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong during login");
  }
}


