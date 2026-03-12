
// proposals.js
// Version without "Под вопросом" vote option

function renderVoteButtons(meeting) {
    return `
        <div class="vote-buttons">
            <button class="vote-btn yes" onclick="voteMeeting(${meeting.id}, 'yes')">Смогу</button>
            <button class="vote-btn no" onclick="voteMeeting(${meeting.id}, 'no')">Не смогу</button>
        </div>
    `;
}

function voteMeeting(meetingId, vote) {
    fetch(`/api/meetings/${meetingId}/vote`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            vote: vote   // only 'yes' or 'no'
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Vote saved", data);
        loadMeetings();
    })
    .catch(err => console.error(err));
}

function renderVotes(meeting) {
    const yes = meeting.yes_votes || 0;
    const no = meeting.no_votes || 0;

    return `
        <div class="vote-stats">
            <span>Смогут · ${yes}</span>
            <span>Не смогут · ${no}</span>
        </div>
    `;
}
