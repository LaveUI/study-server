async function handleGoogleLogin(response) {
  try {
    const res = await fetch("http://localhost:5000/auth/google", {
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
