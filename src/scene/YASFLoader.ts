import * as THREE from 'three';
import { MySceneData } from './MySceneData';

export class YASFLoader {
    data: MySceneData;
    errorMessage: string | null = null;
    xmlDoc: Document | null = null;

    constructor() {
        this.data = new MySceneData();
    }

    async load(url: string): Promise<MySceneData> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load XML: ${response.statusText}`);
        }
        const xmlText = await response.text();
        const parser = new DOMParser();
        this.xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const errorNode = this.xmlDoc.querySelector('parsererror');
        if (errorNode) {
            throw new Error('XML parsing error');
        }

        this.readXML();
        if (this.errorMessage) {
            throw new Error(this.errorMessage);
        }

        this.data.onLoadFinished();
        return this.data;
    }

    private readXML() {
        try {
            const rootElement = this.xmlDoc?.documentElement;
            if (!rootElement) throw new Error("No content in xml file");

            this.checkForUnknownNodes(rootElement, this.data.primaryNodeIds);

            this.loadGlobals(rootElement);
            this.loadSkybox(rootElement);
            this.loadFog(rootElement);
            this.loadTextures(rootElement);
            this.loadMaterials(rootElement);
            this.loadCameras(rootElement);
            this.loadNodes(rootElement);
        } catch (error: any) {
            this.errorMessage = error.message;
        }
    }

    private checkForUnknownNodes(parentElem: Element, list: string[]) {
        for (let i = 0; i < parentElem.children.length; i++) {
            let elem = parentElem.children[i];
            if (!list.includes(elem.tagName)) {
                throw new Error(`unknown xml element '${elem.tagName}' descendent of element '${parentElem.tagName}'`);
            }
        }
    }

    private checkForUnknownAttributes(elem: Element, list: string[]) {
        for (let i = 0; i < elem.attributes.length; i++) {
            let attrib = elem.attributes[i];
            if (!list.includes(attrib.name)) {
                throw new Error(`unknown attribute '${attrib.name}' in element '${elem.tagName}'`);
            }
        }
    }

    private toArrayOfNames(descriptor: any[]) {
        return descriptor.map(d => d.name);
    }

    private getRGBA(element: Element, attributeName: string, required: boolean = true) {
        let value = element.getAttribute(attributeName);
        if (value == null) {
            if (required) throw new Error(`element '${element.id}': color (rgba) value is null for attribute '${attributeName}'.`);
            return null;
        }
        let temp = value.split(' ');
        let rgba = temp.map(v => parseFloat(v));
        let color = new THREE.Color(rgba[0], rgba[1], rgba[2]) as any;
        if (rgba[3] !== undefined) color.a = rgba[3];
        return color;
    }

    private getVector3(element: Element, attributeName: string, required: boolean = true) {
        let value = element.getAttribute(attributeName);
        if (value == null) {
            if (required) throw new Error(`element '${element.id}': vector3 value is null for attribute '${attributeName}'.`);
            return null;
        }
        return value.split(' ').map(v => parseFloat(v));
    }

    private getVector2(element: Element, attributeName: string, required: boolean = true) {
        let value = element.getAttribute(attributeName);
        if (value == null) {
            if (required) throw new Error(`element '${element.id}': vector2 value is null for attribute '${attributeName}'.`);
            return null;
        }
        return value.split(' ').map(v => parseFloat(v));
    }

    private getItem(element: Element, attributeName: string, choices: string[], required: boolean = true) {
        let value = element.getAttribute(attributeName);
        if (value == null) {
            if (required) throw new Error(`element '${element.id}': item value is null for attribute ${attributeName}.`);
            return null;
        }
        value = value.toLowerCase();
        if (!choices.includes(value)) {
            throw new Error(`element '${element.id}': value '${value}' is not a choice in [${choices.toString()}]`);
        }
        return value;
    }

    private getString(element: Element, attributeName: string, required: boolean = true) {
        let value = element.getAttribute(attributeName);
        if (value == null && required) {
            throw new Error(`element '${element.id}': string value is null for attribute '${attributeName}'.`);
        }
        return value;
    }

    private getBoolean(element: Element, attributeName: string, required: boolean = true) {
        let value = this.getItem(element, attributeName, ["true", "t", "1", "false", "f", "0"], required);
        if (value == null) return null;
        return ["1", "true", "t"].includes(value);
    }

    private getInteger(element: Element, attributeName: string, required: boolean = true) {
        let value = this.getString(element, attributeName, required);
        return value ? parseInt(value) : null;
    }

    private getFloat(element: Element, attributeName: string, required: boolean = true) {
        let value = this.getString(element, attributeName, required);
        return value ? parseFloat(value) : null;
    }

    private loadXmlItem(options: { elem: Element, descriptor: any[], extras: any[][] }) {
        let obj: any = {};
        this.checkForUnknownAttributes(options.elem, this.toArrayOfNames(options.descriptor));

        for (let descriptor of options.descriptor) {
            let value: any = null;
            switch (descriptor.type) {
                case "string": value = this.getString(options.elem, descriptor.name, descriptor.required); break;
                case "boolean": value = this.getBoolean(options.elem, descriptor.name, descriptor.required); break;
                case "integer": value = this.getInteger(options.elem, descriptor.name, descriptor.required); break;
                case "float": value = this.getFloat(options.elem, descriptor.name, descriptor.required); break;
                case "vector3": value = this.getVector3(options.elem, descriptor.name, descriptor.required); break;
                case "vector2": value = this.getVector2(options.elem, descriptor.name, descriptor.required); break;
                case "rgba": value = this.getRGBA(options.elem, descriptor.name, descriptor.required); break;
                case "item": value = this.getItem(options.elem, descriptor.name, descriptor.choices, descriptor.required); break;
            }
            if (value == null && descriptor.required === false && descriptor.default !== undefined) {
                value = descriptor.default;
            }
            obj[descriptor.name] = value;
        }
        for (let extra of options.extras) {
            obj[extra[0]] = extra[1];
        }
        return obj;
    }

    private loadChildElementsOfType(elem: Element, targetObj: any, attribute: string, type: string) {
        this.checkForUnknownNodes(elem, [type]);
        targetObj[attribute] = [];
        let elems = elem.getElementsByTagName(type);
        let descriptor = this.data.descriptors[type];
        for (let i = 0; i < elems.length; i++) {
            let obj = this.loadXmlItem({ elem: elems[i], descriptor: descriptor, extras: [["type", type]] });
            targetObj[attribute].push(obj);
        }
    }

    private getAndCheck(parentElem: Element, name: string, min = 1, max = 1) {
        let elems = parentElem.getElementsByTagName(name);
        if (elems.length < min || elems.length > max) {
            if (min > 0) throw new Error(`expected element '${name}' not found or wrong count.`);
            return null;
        }
        return elems[0];
    }

    private loadXmlItems(parentElem: Element, tagName: string, descriptor: any[], extras: any[][], addFunc: Function) {
        let elems = parentElem.getElementsByTagName(tagName);
        for (let i = 0; i < elems.length; i++) {
            let obj = this.loadXmlItem({ elem: elems[i], descriptor: descriptor, extras: extras });
            addFunc.bind(this.data)(obj);
        }
    }

    private loadGlobals(rootElement: Element) {
        let elem = this.getAndCheck(rootElement, 'globals');
        if (elem) this.data.setOptions(this.loadXmlItem({ elem, descriptor: this.data.descriptors["globals"], extras: [["type", "globals"]] }));
    }

    private loadSkybox(rootElement: Element) {
        let elem = this.getAndCheck(rootElement, 'skybox');
        if (elem) this.data.setSkybox(this.loadXmlItem({ elem, descriptor: this.data.descriptors["skybox"], extras: [["type", "skybox"]] }));
    }

    private loadFog(rootElement: Element) {
        let elem = this.getAndCheck(rootElement, 'fog', 0, 1);
        if (elem) this.data.setFog(this.loadXmlItem({ elem, descriptor: this.data.descriptors["fog"], extras: [["type", "fog"]] }));
    }

    private loadTextures(rootElement: Element) {
        let elem = this.getAndCheck(rootElement, 'textures');
        if (elem) this.loadXmlItems(elem, 'texture', this.data.descriptors["texture"], [["type", "texture"]], this.data.addTexture);
    }

    private loadMaterials(rootElement: Element) {
        let elem = this.getAndCheck(rootElement, 'materials');
        if (elem) this.loadXmlItems(elem, 'material', this.data.descriptors["material"], [["type", "material"]], this.data.addMaterial);
    }

    private loadCameras(rootElement: Element) {
        let elem = this.getAndCheck(rootElement, 'cameras');
        if (!elem) return;
        let id = this.getString(elem, "initial")!;
        this.data.setActiveCameraId(id);
        this.loadXmlItems(elem, 'orthogonal', this.data.descriptors["orthogonal"], [["type", "orthogonal"]], this.data.addCamera);
        this.loadXmlItems(elem, 'perspective', this.data.descriptors["perspective"], [["type", "perspective"]], this.data.addCamera);
    }

    private loadNodes(rootElement: Element) {
        let graphs = rootElement.getElementsByTagName('graph');
        if (!graphs.length) throw new Error("graph scene element is missing.");
        let nodeElements = graphs[0].getElementsByTagName('node');
        let lodElements = graphs[0].getElementsByTagName('lod');
        this.data.setRootId(this.getString(graphs[0], "rootid")!);
        for (let i = 0; i < nodeElements.length; i++) this.loadNode(nodeElements[i]);
        for (let i = 0; i < lodElements.length; i++) this.loadLOD(lodElements[i]);
    }

    private loadNode(nodeElement: Element) {
        let id = this.getString(nodeElement, "id")!;
        let obj = this.data.getNode(id) || this.data.createEmptyNode(id);
        obj.castShadows = this.getBoolean(nodeElement, "castshadows", false) || false;
        obj.receiveShadows = this.getBoolean(nodeElement, "receiveshadows", false) || false;
        let transforms = nodeElement.getElementsByTagName('transforms');
        if (transforms.length > 0) this.loadTransforms(obj, transforms[0]);
        let materialsRef = nodeElement.getElementsByTagName('materialref');
        if (materialsRef.length > 0) obj['materialIds'].push(this.getString(materialsRef[0], "id"));
        let childrens = nodeElement.getElementsByTagName('children');
        if (!childrens.length) throw new Error(`in node ${id}, a children node is required`);
        this.loadChildren(obj, childrens[0]);
        obj.loaded = true;
    }

    private loadTransforms(obj: any, transformsElement: Element) {
        for (let i = 0; i < transformsElement.childNodes.length; i++) {
            let temp = transformsElement.childNodes[i] as Element;
            if (temp.nodeType === 1) {
                if (temp.tagName === "scale") obj.transformations.push({ type: "S", scale: this.getVector3(temp, "value3") });
                else if (temp.tagName === "rotate") obj.transformations.push({ type: "R", rotation: this.getVector3(temp, "value3") });
                else if (temp.tagName === "translate") obj.transformations.push({ type: "T", translate: this.getVector3(temp, "value3") });
            }
        }
    }

    private loadChildren(nodeObj: any, childrenElement: Element) {
        let lightIds = ["spotlight", "pointlight", "directionallight"];
        for (let i = 0; i < childrenElement.childNodes.length; i++) {
            let child = childrenElement.childNodes[i] as Element;
            if (child.nodeType === 1) {
                const id = child.tagName;
                if (lightIds.includes(id)) this.data.addChildToNode(nodeObj, this.loadLight(child));
                else if (id === "primitive") {
                    let primitiveObj = this.data.createEmptyPrimitive();
                    this.loadPrimitive(child, primitiveObj);
                    this.data.addChildToNode(nodeObj, primitiveObj);
                } else if (id === "noderef" || id === "lodref") {
                    let refId = this.getString(child, "id")!;
                    let reference = id === "noderef" ? this.data.getNode(refId) || this.data.createEmptyNode(refId) : this.data.getLOD(refId) || this.data.createEmptyLOD(refId);
                    this.data.addChildToNode(nodeObj, reference);
                }
            }
        }
    }

    private loadLight(elem: Element) {
        const type = elem.tagName;
        return this.loadXmlItem({ elem, descriptor: this.data.descriptors[type], extras: [["type", type]] });
    }

    private loadPrimitive(parentElem: Element, primitiveObj: any) {
        for (let primitiveId of this.data.primitiveIds) {
            let elems = parentElem.getElementsByTagName(primitiveId);
            for (let j = 0; j < elems.length; j++) {
                let elem = elems[j];
                let reprObj = this.loadXmlItem({ elem, descriptor: this.data.descriptors[primitiveId], extras: [["type", primitiveId]] });
                if (primitiveId === "nurbs") this.loadChildElementsOfType(elem, reprObj, "controlpoints", "controlpoint");
                primitiveObj.representations.push(reprObj);
                if (primitiveObj.subtype === null) primitiveObj.subtype = primitiveId;
            }
        }
        primitiveObj.loaded = true;
    }

    private loadLOD(lodElement: Element) {
        let id = this.getString(lodElement, "id")!;
        let obj = this.data.getLOD(id) || this.data.createEmptyLOD(id);
        let noderefs = lodElement.getElementsByTagName('noderef');
        for (let i = 0; i < noderefs.length; i++) {
            let refId = this.getString(noderefs[i], "id")!;
            let node = this.data.getNode(refId) || this.data.createEmptyNode(refId);
            obj.children.push({ node, mindist: this.getFloat(noderefs[i], "mindist"), type: "lodnoderef" });
        }
        obj.loaded = true;
    }
}
