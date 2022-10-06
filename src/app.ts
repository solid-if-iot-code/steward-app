import express, { Express, Request, Response } from "express";
import {
    getSessionFromStorage,
    Session
} from '@inrupt/solid-client-authn-node'; 
import cookieSession from "cookie-session";
import { 
    getSolidDataset,
    getPodUrlAll,
    createSolidDataset, 
    buildThing, 
    createThing, 
    saveFileInContainer, 
    getSourceUrl, 
    overwriteFile,
    saveSolidDatasetAt,
    addUrl,
    addStringNoLocale,
    addDate,
    setThing,
    saveSolidDatasetInContainer,
    createContainerAt,
    createContainerInContainer,
    getContainedResourceUrlAll,
    getThingAll,
    getStringNoLocale,
    toRdfJsDataset,
    getThing,
    getUrl,
    setUrl,
    setStringNoLocale
} from '@inrupt/solid-client';
import path from "path";
import * as multer from "multer";
import { randomBytes } from "crypto";
// import { QueryEngine } from "@comunica/query-sparql";
import _ from "lodash";
// const myEngine = new QueryEngine();
const upload = multer.default();
const PORT = process.env.PORT || 3001;
const app: Express = express();
//this uses path join with __dirname
//__dirname is the current directory of the executed file, which is necessary for the js file
//after it is compiled into the dist folder from src/app.ts
app.use('/js', express.static(path.join(__dirname, 'public/js')))
app.use(express.json());
app.use(express.urlencoded());
//app.use(bodyParser.urlencoded());
//this sets the views directory for the compiled app.js file in the dist folder after tpyescript has compiled
app.set('views', path.join(__dirname, '/views'))
app.set('view engine', 'pug');
//app.use(cors());
app.use(
    cookieSession({
      name: "session",
      // These keys are required by cookie-session to sign the cookies.
      keys: [
        "Required, but value not relevant for this demo - key1",
        "Required, but value not relevant for this demo - key2",
      ],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })
);

app.get('/', (req: Request, res: Response) => {
    res.render('index.pug')
})

app.post("/login", upload.none(), (req: Request, res: Response) => {
    (req.session as CookieSessionInterfaces.CookieSessionObject).oidcIssuer = req.body.oidcIssuer;
    res.redirect('/login');
})

app.get("/login", async (req: Request, res: Response) => {
    const session = new Session();
    const oidcIssuer = (req.session as CookieSessionInterfaces.CookieSessionObject).oidcIssuer;
    (req.session as CookieSessionInterfaces.CookieSessionObject).sessionId = session.info.sessionId;
    const redirectToSolidIdentityProvider = (url: string) => {
        res.redirect(url);
    };
    try {
        await session.login({
            redirectUrl: `http://localhost:${PORT}/redirect-from-solid-idp`,
            oidcIssuer: oidcIssuer,
            clientName: "SOLID-if-IoT Steward App",
            handleRedirect: redirectToSolidIdentityProvider,
        });
    } catch (err) {
        res.redirect('/');
    }
});
  
app.get("/redirect-from-solid-idp", async (req: Request, res: Response) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);

    await (session as Session).handleIncomingRedirect(`http://localhost:${PORT}${req.url}`);

    if ((session as Session).info.isLoggedIn) {
        res.redirect('/home');
    }
});

app.get('/home', async (req: Request, res: Response) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);
    if (session) {
        res.render('home.pug')
    } else {
        res.render('error.pug')
    }
})

app.get('/create_sensor', async (req: Request, res: Response) => { 
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);
    if (session) {
        res.render('inspect.pug')
    } else {
        res.render('error.pug')
    }
})

function genRandomToken() {
    return randomBytes(64).toString('hex');
}

async function getSensorInboxResource(session: Session, webId: string): Promise<string | null> {
    //const webId = session.info.webId!;
    let dataset = await getSolidDataset(webId, { fetch: session.fetch });
    const rdfThing = getThing(dataset, webId);
    const extendedProfileUri = getUrl(rdfThing!, 'http://www.w3.org/2000/01/rdf-schema#seeAlso');
    // dereference extended profile document w/ uri
    let extendedProfileDataset = await getSolidDataset(extendedProfileUri!, { fetch: session.fetch });
    // https://solid.github.io/webid-profile/#reading-extended-profile-documents
    // https://solid.github.io/data-interoperability-panel/specification/#data-grant
    // query the dataset for the user card 
    const extWebID = getThing(extendedProfileDataset, webId);
    const sensorInboxUri = getStringNoLocale(extWebID!, 'http://www.example.org/sensor#sensorInbox');
    return sensorInboxUri;
}

app.post('/add_sensor', async (req: Request, res: Response) => { 
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
    if (session) {
        //console.log(req.body)
        //console.log('here we are')
        const sensorName = req.body.sensorName;
        //console.log(sensorName)
        const webIds: Array<string> = typeof req.body.webIds === 'string' ? [req.body.webIds] : req.body.webIds;
        const sensorUri = req.body.sensorUri;
        //console.log(sensorUri)
        const brokerUri = req.body.brokerUri;
        //console.log(brokerUri)
        const topics: Array<string> = typeof req.body.topic === 'string' ? [req.body.topic] : req.body.topic;
        //console.log(topics)
        const topicTypes: Array<string> = typeof req.body.topicType === 'string' ? [req.body.topicType] : req.body.topicType;
        //console.log(topicTypes)
        let sensorThing = buildThing(createThing())
            .addIri('https://www.example.org/sensor#sensorUri', sensorUri)
            .addIri('https://www.example.org/sensor#brokerUri', brokerUri)
            .build();
        let newThing;
        for (let i = 0; i < topics.length; i++) {
            //console.log(topics[i])
            if (topicTypes[i] === 'publish') {
                newThing = addStringNoLocale(sensorThing, 'https://www.example.org/sensor#publishTopic', topics[i]);
            } else {
                sensorThing = addStringNoLocale(sensorThing, 'https://www.example.org/sensor#subscribeTopic', topics[i]);
            }
        }
        //sensorThing = addStringNoLocale(sensorThing, 'https://www.example.com/key#secure', '');
        let keyThings: any = {}
        //console.log('made keythings')
        for (const webId of webIds) {
            //console.log('looping')
            const key = genRandomToken();
            //console.log(webId)
            //console.log(key);
            let newThing = setStringNoLocale(sensorThing, 'https://www.example.com/key#secure', key);
            //console.log(newThing)
            keyThings[webId] = newThing;
        }
        //console.log(keyThings)
        for (const webId of webIds) {
            let newData = createSolidDataset();
            newData = setThing(newData, keyThings[webId])
            try {
                const sensorInboxUri = await getSensorInboxResource(session, webId);
                console.log(sensorInboxUri);
                await saveSolidDatasetInContainer(sensorInboxUri as string, newData, { fetch: session.fetch })
                //console.log(sensorInboxUri);
                console.log('success')
                res.status(200).end();
            } catch (err) {
                console.log(err);
            }
        }
        res.status(401).end();
        //res.redirect('/home');
    } else {
        res.redirect('/error')
    }
})

app.get('/error', (req: Request, res: Response) => {
    res.render('error.pug');
});

app.get('/logout', async (req: Request, res: Response) => {
    if (typeof req.session === undefined || typeof req.session === null) {
        res.render('error.pug')
    } else {
        const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
        if (session?.info.isLoggedIn) {
            await session.logout();
        }
        res.render('logged_out.pug')
    }
})

app.listen(PORT, () => {
    console.log(`Server started on port: ${PORT}`)
})