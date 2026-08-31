export class MySceneData {
    options: any = null;
    skyboxes: any = [];
    fog: any = null;
    materials: any = [];
    lights: any = [];
    textures: any = [];
    cameras: any = [];
    activeCameraId: string | null = null;
    nodes: any = [];
    rootId: string | null = null;
    lods: any = [];
    descriptors: any = [];
    customAttributeName = "custom";
    primaryNodeIds: string[];
    primitiveIds: string[];

    constructor() {
        this.descriptors["globals"] = [
            { name: "background", type: "rgba" },
            { name: "ambient", type: "rgba" },
        ];
        this.descriptors["fog"] = [
            { name: "color", type: "rgba" },
            { name: "near", type: "float" },
            { name: "far", type: "float" },
        ];
        this.descriptors["texture"] = [
            { name: "id", type: "string" },
            { name: "filepath", type: "string" },
            { name: "isVideo", type: "boolean", required: false, default: false },
            { name: "magFilter", type: "string", required: false, default: "LinearFilter" },
            { name: "minFilter", type: "string", required: false, default: "LinearMipmapLinearFilter" },
            { name: "mipmaps", type: "boolean", required: false, default: true },
            { name: "anisotropy", type: "integer", required: false, default: 1 },
            { name: "mipmap0", type: "string", required: false, default: null },
            { name: "mipmap1", type: "string", required: false, default: null },
            { name: "mipmap2", type: "string", required: false, default: null },
            { name: "mipmap3", type: "string", required: false, default: null },
            { name: "mipmap4", type: "string", required: false, default: null },
            { name: "mipmap5", type: "string", required: false, default: null },
            { name: "mipmap6", type: "string", required: false, default: null },
            { name: "mipmap7", type: "string", required: false, default: null },
        ];
        this.descriptors["material"] = [
            { name: "id", type: "string" },
            { name: "color", type: "rgba" },
            { name: "specular", type: "rgba" },
            { name: "emissive", type: "rgba" },
            { name: "shininess", type: "float" },
            { name: "wireframe", type: "boolean", required: false, default: false },
            { name: "shading", type: "item", required: false, choices: ["none", "flat", "smooth"], default: "smooth" },
            { name: "textureref", type: "string", required: false, default: null },
            { name: "texlength_s", type: "float", required: false, default: 1.0 },
            { name: "texlength_t", type: "float", required: false, default: 1.0 },
            { name: "twosided", type: "boolean", required: false, default: false },
            { name: "bumpref", type: "string", required: false, default: null },
            { name: "bumpscale", type: "float", required: false, default: 1.0 },
            { name: "specularref", type: "string", required: false, default: null },
        ];
        this.descriptors["orthogonal"] = [
            { name: "id", type: "string" },
            { name: "near", type: "float" },
            { name: "far", type: "float" },
            { name: "location", type: "vector3" },
            { name: "target", type: "vector3" },
            { name: "left", type: "float" },
            { name: "right", type: "float" },
            { name: "bottom", type: "float" },
            { name: "top", type: "float" },
        ];
        this.descriptors["perspective"] = [
            { name: "id", type: "string" },
            { name: "angle", type: "float" },
            { name: "near", type: "float" },
            { name: "far", type: "float" },
            { name: "location", type: "vector3" },
            { name: "target", type: "vector3" }
        ];
        this.descriptors["cylinder"] = [
            { name: "base", type: "float" },
            { name: "top", type: "float" },
            { name: "height", type: "float" },
            { name: "slices", type: "integer" },
            { name: "stacks", type: "integer" },
            { name: "capsclose", type: "boolean", required: false, default: false },
            { name: "thetastart", type: "float", required: false, default: 0.0 },
            { name: "thetalength", type: "float", required: false, default: 2 * Math.PI },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["rectangle"] = [
            { name: "xy1", type: "vector2" },
            { name: "xy2", type: "vector2" },
            { name: "parts_x", type: "integer", required: false, default: 1 },
            { name: "parts_y", type: "integer", required: false, default: 1 },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["triangle"] = [
            { name: "xyz1", type: "vector3" },
            { name: "xyz2", type: "vector3" },
            { name: "xyz3", type: "vector3" },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["model3d"] = [
            { name: "filepath", type: "string" },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["sphere"] = [
            { name: "radius", type: "float" },
            { name: "slices", type: "integer" },
            { name: "stacks", type: "integer" },
            { name: "thetastart", type: "float", required: false, default: 0.0 },
            { name: "thetalength", type: "float", required: false, default: Math.PI },
            { name: "phistart", type: "float", required: false, default: 0.0 },
            { name: "philength", type: "float", required: false, default: 2 * Math.PI },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["box"] = [
            { name: "xyz1", type: "vector3" },
            { name: "xyz2", type: "vector3" },
            { name: "parts_x", type: "integer", required: false, default: 1 },
            { name: "parts_y", type: "integer", required: false, default: 1 },
            { name: "parts_z", type: "integer", required: false, default: 1 },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["nurbs"] = [
            { name: "degree_u", type: "integer" },
            { name: "degree_v", type: "integer" },
            { name: "parts_u", type: "integer" },
            { name: "parts_v", type: "integer" },
            { name: "distance", type: "float", required: false, default: 0.0 },
        ];
        this.descriptors["controlpoint"] = [
            { name: "xx", type: "float" },
            { name: "yy", type: "float" },
            { name: "zz", type: "float" },
        ];
        this.descriptors["skybox"] = [
            { name: "size", type: "vector3" },
            { name: "center", type: "vector3" },
            { name: "emissive", type: "rgba" },
            { name: "intensity", type: "float" },
            { name: "up", type: "string" },
            { name: "down", type: "string" },
            { name: "left", type: "string" },
            { name: "right", type: "string" },
            { name: "front", type: "string" },
            { name: "back", type: "string" },
        ];
        this.descriptors["polygon"] = [
            { name: "radius", type: "float" },
            { name: "stacks", type: "integer" },
            { name: "slices", type: "integer" },
            { name: "color_c", type: "rgba" },
            { name: "color_p", type: "rgba" }
        ];
        this.descriptors["spotlight"] = [
            { name: "id", type: "string" },
            { name: "color", type: "rgba" },
            { name: "position", type: "vector3" },
            { name: "target", type: "vector3" },
            { name: "angle", type: "float" },
            { name: "enabled", type: "boolean", required: false, default: true },
            { name: "intensity", type: "float", required: false, default: 1.0 },
            { name: "distance", type: "float", required: false, default: 1000 },
            { name: "decay", type: "float", required: false, default: 2.0 },
            { name: "penumbra", type: "float", required: false, default: 1.0 },
            { name: "castshadow", type: "boolean", required: false, default: false },
            { name: "shadowfar", type: "float", required: false, default: 500.0 },
            { name: "shadowmapsize", type: "integer", required: false, default: 512 },
        ];
        this.descriptors["pointlight"] = [
            { name: "id", type: "string" },
            { name: "color", type: "rgba" },
            { name: "position", type: "vector3" },
            { name: "enabled", type: "boolean", required: false, default: true },
            { name: "intensity", type: "float", required: false, default: 1.0 },
            { name: "distance", type: "float", required: false, default: 1000 },
            { name: "decay", type: "float", required: false, default: 2.0 },
            { name: "castshadow", type: "boolean", required: false, default: false },
            { name: "shadowfar", type: "float", required: false, default: 500.0 },
            { name: "shadowmapsize", type: "integer", required: false, default: 512 },
        ];
        this.descriptors["directionallight"] = [
            { name: "id", type: "string" },
            { name: "color", type: "rgba" },
            { name: "position", type: "vector3" },
            { name: "enabled", type: "boolean", required: false, default: true },
            { name: "intensity", type: "float", required: false, default: 1.0 },
            { name: "castshadow", type: "boolean", required: false, default: false },
            { name: "shadowleft", type: "float", required: false, default: -5.0 },
            { name: "shadowright", type: "float", required: false, default: 5.0 },
            { name: "shadowbottom", type: "float", required: false, default: -5.0 },
            { name: "shadowtop", type: "float", required: false, default: 5.0 },
            { name: "shadowfar", type: "float", required: false, default: 500.0 },
            { name: "shadowmapsize", type: "integer", required: false, default: 512 },
        ];
        this.primaryNodeIds = ["globals", "fog", "skybox", "textures", "materials", "cameras", "graph"];
        this.primitiveIds = ["cylinder", "rectangle", "triangle", "sphere", "nurbs", "box", "model3d", "skybox", "lod", "polygon"];
    }

    createCustomAttributeIfNotExists(obj: any) {
        if (obj[this.customAttributeName] === undefined || obj[this.customAttributeName] === null) obj[this.customAttributeName] = {};
    }

    setOptions(options: any) {
        this.options = options;
        this.createCustomAttributeIfNotExists(options);
    }

    getOptions() {
        return this.options;
    }

    setSkybox(skybox: any) {
        if (skybox.id === undefined) {
            skybox.id = "default";
        }
        this.skyboxes[skybox.id] = skybox;
        this.createCustomAttributeIfNotExists(skybox);
    }

    getSkybox() {
        return this.skyboxes["default"];
    }

    setFog(fog: any) {
        this.fog = fog;
        this.createCustomAttributeIfNotExists(fog);
    }

    getFog() {
        return this.fog;
    }

    setRootId(rootId: string) {
        this.rootId = rootId;
    }

    getMaterial(id: string) {
        let value = this.materials[id];
        if (value === undefined) return null;
        return value;
    }

    addMaterial(material: any) {
        let obj = this.getMaterial(material.id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a material with id " + material.id + " already exists!");
        }
        this.materials[material.id] = material;
        this.createCustomAttributeIfNotExists(material);
    }

    addTexture(texture: any) {
        let obj = this.getTexture(texture.id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a texture with id " + texture.id + " already exists!");
        }
        this.textures[texture.id] = texture;
        this.createCustomAttributeIfNotExists(texture);
    }

    getTexture(id: string) {
        let value = this.textures[id];
        if (value === undefined) return null;
        return value;
    }

    setActiveCameraId(id: string) {
        return this.activeCameraId = id;
    }

    getCamera(id: string) {
        let value = this.cameras[id];
        if (value === undefined) return null;
        return value;
    }

    setActiveCamera(id: string) {
        this.activeCameraId = id;
    }

    addCamera(camera: any) {
        if (camera.type !== "orthogonal" && camera.type !== "perspective") {
            throw new Error("inconsistency: unsupported camera type " + camera.type + "!");
        }
        let obj = this.getCamera(camera.id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a camera with id " + camera.id + " already exists!");
        }
        this.cameras[camera.id] = camera;
        this.createCustomAttributeIfNotExists(camera);
    }

    getLight(id: string) {
        let value = this.lights[id];
        if (value === undefined) return null;
        return value;
    }

    addLight(light: any) {
        var obj = this.getLight(light.id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a light with id " + light.id + " already exists!");
        }
        this.lights[light.id] = light;
        this.createCustomAttributeIfNotExists(light);
    }

    getNode(id: string) {
        let value = this.nodes[id];
        if (value === undefined) return null;
        return value;
    }

    createEmptyNode(id: string) {
        let obj = this.getNode(id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a node with id " + id + " already exists!");
        }
        obj = { id: id, transformations: [], materialIds: [], children: [], loaded: false, type: "node", castShadows: false, receiveShadows: false };
        this.addNode(obj);
        return obj;
    }

    addNode(node: any) {
        let obj = this.getNode(node.id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a node with id " + node.id + " already exists!");
        }
        this.nodes[node.id] = node;
        this.createCustomAttributeIfNotExists(node);
    }

    addChildToNode(node: any, child: any) {
        if (child === undefined) {
            throw new Error("inconsistency: undefined child add to node!");
        }
        if (node.children === undefined) {
            throw new Error("inconsistency: a node has an undefined array of children!");
        }
        node.children.push(child);
        this.createCustomAttributeIfNotExists(child);
    }

    createEmptyPrimitive() {
        let obj = { type: "primitive", subtype: null, representations: [], loaded: false };
        return obj;
    }

    onLoadFinished() {
        console.info("------------------ consolidating data structures ------------------");
    }

    getLOD(id: string) {
        let value = this.lods[id];
        if (value === undefined) return null;
        return value;
    }

    createEmptyLOD(id: string) {
        let obj = this.getLOD(id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a LOD with id " + id + " already exists!");
        }
        obj = { id: id, children: [], loaded: false, type: "lod" };
        this.addLOD(obj);
        return obj;
    }

    addLOD(lod: any) {
        let obj = this.getLOD(lod.id);
        if (obj !== null && obj !== undefined) {
            throw new Error("inconsistency: a LOD with id " + lod.id + " already exists!");
        }
        this.lods[lod.id] = lod;
        this.createCustomAttributeIfNotExists(lod);
    }
}
