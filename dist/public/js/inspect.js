function addTopic() {
    const topicsDiv = document.querySelector('#topics');
    const el = document.createElement('div');
    const topicLabel = document.createElement('label');
    const typeLabel = document.createElement('label');
    topicLabel.for = 'sensorTopic';
    topicLabel.textContent = 'Topic: ';
    typeLabel.for = 'sensorType';
    typeLabel.textContent = 'Sensor Type: ';
    const topicInput = document.createElement('input');
    topicInput.className = 'topic';
    topicInput.type = 'text'
    el.appendChild(topicLabel)
    el.appendChild(topicInput)
    el.appendChild(typeLabel);
    topicsDiv.appendChild(el);
    //alert('Click!')
}

function sendForm() {
    const FD = new FormData(form);
    let s = '';
    // https://stackoverflow.com/questions/7542586/new-formdata-application-x-www-form-urlencoded
    for(const pair of FD.entries()) {
        s += (s?'&':'') + encodeURIComponent(pair[0]).replace(/%20/g, '+')+'='+encodeURIComponent(pair[1]).replace(/%20/g, '+');
    }
    
    const XHR = new XMLHttpRequest();
    let i = 0;
    const topics = document.querySelectorAll('.topic');
    let topicsFd = [];
    for (const topic of topics) {
        let topicName = `${topic.value}${i.toString()}`
        topicsFd.push(`${encodeURIComponent(topicName)}=${encodeURIComponent(topic.value)}`)
        i++;
    }
    const urlEncodedData = topicsFd.join('&').replace(/%20/g, '+');
    s += `&${urlEncodedData}`;
    XHR.open("POST", "/add_sensor");
    XHR.addEventListener('load', (event) => {
        //alert('Yeah! Data sent and response loaded.');
        
      });
      // Define what happens in case of error
      XHR.addEventListener('error', (event) => {
        alert('Oops! Something went wrong.');
      });
    XHR.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    XHR.send(s);
    XHR.onreadystatechange = () => {
      if (XHR.readyState === 4) {
        if (XHR.status === 200) {
          alert('Success!')
          window.location = '/home';
        }
      }
    }
    //console.log(FD)
}
const form = document.querySelector('#add_sensor');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendForm();
})