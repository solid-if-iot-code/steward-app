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
    setStringNoLocale,
    universalAccess
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

function parseData(body: any) {
    const sensorName = body.sensorName;
    const webIds: Array<string> = body.webIds.split(',');
    const sensorUri = body.sensorUri;
    const brokerUri = body.brokerUri;
    const topics: Array<string> = typeof body.topic === 'string' ? [body.topic] : body.topic;
    const topicTypes: Array<string> = typeof body.topicType === 'string' ? [body.topicType] : body.topicType;
    return { sensorName, webIds, sensorUri, brokerUri, topics, topicTypes}
}

function buildSensorInfoThing(sensorName: string, sensorUri: string, brokerUri: string, topicsUri: string) {
    let sensorThing = buildThing(createThing({name: sensorName}))
        .addStringNoLocale('https://www.example.org/sensor#sensorUri', sensorUri)
        .addIri('https://www.example.org/sensor#brokerUri', brokerUri)
        .addStringNoLocale('https://www.example.org/sensor#name', sensorName)
        .addIri('https://www.example.org/sensor#topicsUri', topicsUri)
        .build();
    
    return sensorThing;
}

function buildThingsDictWithSecretKey(sensorThing: any, webIds: Array<string>) {
    let keyThings: any = {}
    for (const webId of webIds) {
        const key = genRandomToken();
        let newThing = setStringNoLocale(sensorThing, 'https://www.example.com/key#secure', key);
        keyThings[webId] = newThing;
    }
    return keyThings;
}

async function checkContainerExistsAndCreate(containerUri: string, session: Session) {
    try {
        await getSolidDataset(containerUri, {fetch: session.fetch})
        return true;
    } catch (err) {
        console.log(err);
        try {
            await createContainerAt(containerUri, {fetch: session.fetch});
            return true;
        } catch (err: any) {
            throw new Error(err.message);
        }
    }
}

async function checkResourceExistsAndCreate(resourceUri: string, session: Session) {
    try {
        await getSolidDataset(resourceUri, {fetch: session.fetch})
        return true;
    } catch (err) {
        console.log(err);
        let data = createSolidDataset();
        try {
            await saveSolidDatasetAt(resourceUri, data, {fetch: session.fetch});
            return true;
        } catch (err: any) {
            throw new Error(err.message);
        }
    }
}

async function getStorageUri(session: Session) {
    const webId = session.info.webId!;
    const webIdData = await getSolidDataset(webId, { fetch: session.fetch })
    const webIdDoc = getThing(webIdData, webId);
    const storageUri = getUrl(webIdDoc!, 'http://www.w3.org/ns/pim/space#storage');
    return storageUri;
}

async function setAccessForWebIdsAtUrl(session: Session, urls: Array<string>, webIds: Array<string>) {
    try {
        for (const webId of webIds) {
            for (const url of urls) {
                await universalAccess.setAgentAccess(url, webId, { read: true, write: false }, { fetch: session.fetch })
            }
        }
    } catch (err: any) {
        throw new Error(err.message)
    }    
}

function buildTopicsThing(topics: Array<string>, topicTypes: Array<string>) {
    let topicsThing = buildThing(createThing()).build();
    for (let i = 0; i < topics.length; i++) {
        if (topicTypes[i] === 'publish') {
            topicsThing = addStringNoLocale(topicsThing, 'https://www.example.org/sensor#publishTopic', topics[i]);
        } else {
            topicsThing = addStringNoLocale(topicsThing, 'https://www.example.org/sensor#subscribeTopic', topics[i]);
        }
    }
    return topicsThing;
}

app.post('/add_sensor', async (req: Request, res: Response) => { 
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
    if (session) {
        console.log(req.body)
        try {
            const storageUri = await getStorageUri(session)
            const { sensorName, webIds, sensorUri, brokerUri, topics, topicTypes } = parseData(req.body);
            const newSensorContainerUri = `${storageUri}public/sensors/${sensorName}/`
            if (await checkContainerExistsAndCreate(newSensorContainerUri, session)) {
                await setAccessForWebIdsAtUrl(session, [newSensorContainerUri], webIds)
            } 
            const newSensorInfoUri = `${newSensorContainerUri}info`;
            const newSensorTopicsUri = `${newSensorContainerUri}topics`;
            if (await checkResourceExistsAndCreate(newSensorInfoUri, session) && await checkResourceExistsAndCreate(newSensorTopicsUri, session)) { 
                await setAccessForWebIdsAtUrl(session, [newSensorInfoUri, newSensorTopicsUri], webIds);
            }
            let topicsThing = buildTopicsThing(topics, topicTypes)
            let topicsDataset = await getSolidDataset(newSensorTopicsUri);
            topicsDataset = setThing(topicsDataset, topicsThing);
            await saveSolidDatasetAt(newSensorTopicsUri, topicsDataset, { fetch: session.fetch });

            let sensorThing = buildSensorInfoThing(sensorName, sensorUri, brokerUri, newSensorTopicsUri);
            let keyThings = buildThingsDictWithSecretKey(sensorThing, webIds);
            for (const webId of webIds) {
                let newData = createSolidDataset();
                newData = setThing(newData, keyThings[webId])
                const sensorInboxUri = await getSensorInboxResource(session, webId);
                await saveSolidDatasetInContainer(sensorInboxUri as string, newData, { fetch: session.fetch })
                console.log('success')
            } 
            res.status(200).end();
        } catch (err) {
            res.redirect('/error');
        }
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