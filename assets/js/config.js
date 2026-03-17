(() => {
    const isLocal =
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";

    const LOCAL_API = "http://127.0.0.1:8000";
    const PROD_API  = "https://laoreat-api.onrender.com";

    window.API_BASE = isLocal ? LOCAL_API : PROD_API;

    // Uncomment when testing Render API on localhost
    window.API_BASE = PROD_API;
})();