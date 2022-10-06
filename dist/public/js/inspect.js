let k = 0;
let kList = [];

function addTopic() {
    const topicsDiv = document.querySelector('#topics');
    const el = document.createElement('div');
    const topicLabel = document.createElement('label');
    const typeLabel = document.createElement('label');
    topicLabel.for = 'sensorTopic';
    topicLabel.textContent = 'Topic: ';
    typeLabel.for = 'topicType';
    typeLabel.textContent = 'Topic Type: ';
    const topicInput = document.createElement('input');
    topicInput.className = 'topic';
    topicInput.type = 'text'
    const typeList = document.createElement('select');
    typeList.class = 'topicType'
    
    typeList.id = `topicType${k}`
    kList.push(`topicType${k}`);
    const options = ['subscribe', 'publish']
    for (const opt of options) {
      let opEl = document.createElement('option');
      opEl.value = opt
      opEl.textContent = opt
      //opEl.id = 'topicType'
      typeList.appendChild(opEl)
    }
    el.appendChild(topicLabel)
    el.appendChild(topicInput)
    el.appendChild(typeLabel);
    el.appendChild(typeList)
    topicsDiv.appendChild(el);
    k++;
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
      let topicName = 'topic'
      topicsFd.push(`${encodeURIComponent(topicName)}=${encodeURIComponent(topic.value)}`)
      i++;
  }
  const urlEncodedData = topicsFd.join('&').replace(/%20/g, '+');
  s += `&${urlEncodedData}`
  
  let typesFd = [];
  for (const id of kList) {
    console.log(id);
    const el = document.getElementById(`${id}`);
    //console.log(el)
    console.log(el.value);
    let typeName = 'topicType';
    typesFd.push(`${encodeURIComponent(typeName)}=${encodeURIComponent(el.value)}`)
  }
  const typeEncodedData = typesFd.join('&').replace(/%20/g, '+');
  s += `&${typeEncodedData}`
  XHR.open("POST", "/add_sensor");
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
      } else {
        alert('Error! Something went wrong')
        window.location = '/error'
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