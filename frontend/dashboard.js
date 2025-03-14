/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
// Check if the user has a valid token
const token = localStorage.getItem("authToken");

if (!token) {
    alert("You must be logged in to access this page.");
    window.location.href = "login.html";
} else {
    try {
        // Decode the JWT token
        const payload = JSON.parse(atob(token.split(".")[1]));

        // Check if the token has expired
        const currentTime = Math.floor(Date.now() / 1000);
        if (payload.exp < currentTime) {
            alert("Session expired. Please log in again.");
            localStorage.removeItem("authToken");
            window.location.href = "login.html";
        } else {
            document.addEventListener("DOMContentLoaded", function() {
                const userEmail = document.getElementById("userEmail");
                if (userEmail) {
                    userEmail.textContent = payload.email;
                }
                loadOpportunities(payload.ngo_id); // Load only opportunities for this NGO
                fetchFiles();
            });
        }
    } catch (error) {
        console.error("Error decoding token:", error);
        alert("Invalid session. Please log in again.");
        localStorage.removeItem("authToken");
        window.location.href = "login.html";
    }
}

function logout() {
    localStorage.removeItem("authToken");
    alert("You have been logged out.");
    window.location.href = "login.html";
}

// Fetch and display opportunities based on NGO ID
function loadOpportunities(ngoId) {
    fetch(`http://localhost:3000/api/opportunities?ngo_id=${ngoId}`)
        .then(response => response.json())
        .then(data => {
            const list = document.getElementById("opportunitiesList");
            list.innerHTML = "";

            if (data.length === 0) {
                list.innerHTML = "<li class='list-group-item'>No opportunities available.</li>";
            } else {
                data.forEach(opportunity => {
                    const listItem = document.createElement("li");
                    listItem.classList.add("list-group-item", "d-flex", "justify-content-between", "align-items-center");

                    // Opportunity details
                    listItem.innerHTML = `
                        <span>${opportunity.title} - ${new Date(opportunity.date).toDateString()} - ${opportunity.location}</span>
                        <span>Coordinator: ${opportunity.coordinator_name} (${opportunity.coordinator_email}, ${opportunity.coordinator_phone})</span>
                        <div>
                            <button class="btn btn-success btn-sm" onclick="redirectToApplyPage(${opportunity.id})">Apply</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteOpportunity(${opportunity.id})">Delete</button>
                        </div>
                    `;

                    list.appendChild(listItem);
                });
            }
        })
        .catch(error => {
            console.error("Error fetching opportunities:", error);
        });
}

// Redirect user to the apply page
function redirectToApplyPage(opportunityId) {
    window.location.href = `apply.html?opportunity_id=${opportunityId}`;
}

// Submit a new opportunity with NGO ID
function submitOpportunity() {
    const title = document.getElementById("title").value;
    const description = document.getElementById("description").value;
    const date = document.getElementById("date").value;
    const location = document.getElementById("location").value;
    const coordinatorName = document.getElementById("coordinatorName").value;
    const coordinatorEmail = document.getElementById("coordinatorEmail").value;
    const coordinatorPhone = document.getElementById("coordinatorPhone").value;

    if (!title || !description || !date || !location || !coordinatorName || !coordinatorEmail || !coordinatorPhone) {
        alert("Please fill in all fields before submitting.");
        return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
    }

    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const ngoId = payload.ngo_id; // Extract NGO ID from token

        const opportunityData = { title, description, date, location, ngo_id: ngoId, coordinator_name: coordinatorName, coordinator_email: coordinatorEmail, coordinator_phone: coordinatorPhone };

        fetch("http://localhost:3000/api/opportunities", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(opportunityData)
            })
            .then(response => response.json())
            .then(data => {
                alert(data.message);
                loadOpportunities(ngoId);
            })
            .catch(error => console.error("Error submitting opportunity:", error));
    } catch (error) {
        console.error("Error decoding token:", error);
        alert("Invalid session. Please log in again.");
        localStorage.removeItem("authToken");
        window.location.href = "login.html";
    }
}

// Delete an opportunity (only the NGO that created it can delete it)
function deleteOpportunity(id) {
    if (!confirm("Are you sure you want to delete this opportunity?")) return;

    const token = localStorage.getItem("authToken");
    if (!token) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
    }

    fetch(`http://localhost:3000/api/opportunities/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            const payload = JSON.parse(atob(token.split(".")[1]));
            loadOpportunities(payload.ngo_id); // Refresh the list
        })
        .catch(error => console.error("Error deleting opportunity:", error));
}

// Load data when the page loads
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("authToken");
    if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        loadOpportunities(payload.ngo_id);
    }
    fetchFiles();
});