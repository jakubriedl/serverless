'use strict';

const SError            = require('./Error'),
  SUtils                = require('./utils/index'),
  SCli                  = require('./utils/cli'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs'),
  os                    = require('os');

class Project extends SerializerFileSystem {

  constructor(S) {

    super(S);

    let _this             = this;
    _this._S              = S;
    _this._class          = 'Project';

    // Default properties
    _this.name            = 'serverless' + SUtils.generateShortId(6);
    _this.version         = '0.0.1';
    _this.location        = 'https://github.com/...';
    _this.author          = '';
    _this.description     = 'A Slick New Serverless Project';
    _this.custom          = {};
    _this.plugins         = [];
    _this.components      = {};
    _this.stages          = {};
    _this.resources       = {
      defaultResources:   new this._S.classes.Resources(this._S)
    };  // This is an object because in the near future, we will introduce multiple resources stacks within a project
    _this.variables       = new this._S.classes.Variables(this._S);
    _this.templates       = new this._S.classes.Templates(this._S);
  }

  load() {
    return this.deserialize(this);
  }

  save() {
    return this.serialize(this);
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate
    let obj = _.assign(this.toObject(), {components: this.components});
    return SUtils.populate(this.getVariables(), this.getTemplates(), obj, options.stage, options.region);
  }

  fromObject(data) {

    let _this = this;

    // Flush data
    _this.components   = {};
    _this.stages       = {};
    _this.variables    = {};
    _this.templates    = {};
    _this.resources    = {};

    if (data.components) {
      for (let c of Object.keys(data.components)) {
        let componentClass = new _this._S.classes.Component(_this._S, _this);
        this.setComponent(componentClass.fromObject(data.components[c]));
      }
    }
    if (data.stages) {
      for (let s of Object.keys(data.stages)) {
        let stageClass = _this._S.classes.Stage(_this._S);
        this.setStage(stageClass.fromObject(data.stages[s]));
      }
    }
    if (data.variables) {
      let variableClass = _this._S.classes.Variables(_this._S);
      this.setVariables(variableClass.fromObject(data.variables[v]));
    }
    if (data.templates) {
      let templatesClass = _this._S.classes.Templates(_this._S);
      this.setTemplates(templatesClass.fromObject(data.templates[t]));
    }
    if (data.resources) {
      for (let r of Object.keys(data.resources)) {
        let resourcesClass = _this._S.classes.Resources(_this._S);
        this.setResources(resourcesClass.fromObject(data.resources[r]));
      }
    }

    _.assign(_this, data);
    return _this;
  }

  getRootPath() {
    return this._S.config.projectPath;
  }

  getFilePath() {
    let args = _.toArray( arguments );
    args.unshift( this.getRootPath() );
    return path.join.apply( path, args );
  }

  getName() {
    return this.name;
  }

  getAllComponents() {
    return _.values( this.components );
  }

  getComponent( componentName ){
    return _.find( _.values( this.components ), c => {
      return c.getName() === componentName;
    });
  }

  setComponent( component ) {
    this.components[ component.name ] = component;
  }

  validateComponentExists( component ){
    return this.components[ component ] != undefined;
  }

  getPlugins(){
    return this.plugins;
  }

  addPlugin( pluginName ){
    this.plugins.push( pluginName );
  }

  getAllFunctions() {
    return _.flatten( _.map( this.getAllComponents(), component =>
      component.getAllFunctions()
    ));
  }

  getFunction( functionName ){
    return _.find( this.getAllFunctions(), f =>
      f.getName() === functionName
    )
  }

  getAllEndpoints(options) {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEndpoints() ) );
  }

  getEndpoint( endpointPath, endpointMethod ){
    return _.find( _.values( this.getAllEndpoints() ), e =>
      e.path === endpointPath && e.method === endpointMethod
    )
  }

  getAllEvents(options) {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEvents() ) );
  }

  getEvent( eventName ){
    return _.find( _.values( this.getAllEvents() ), e =>
      e.name === eventName
    )
  }

  setResources(resources) {
    this.resources[ resources.getName() ] = resources;
  }


  getResources(resourcesName) {
    if (this.resources[resourcesName]) return this.resources[resourcesName];
    else return this.resources[Object.keys(this.resources)[0]]; // This temporarily defaults to a single resource stack for backward compatibility
  }

  getStages() {
    return Object.keys( this.stages );
  }

  getStage( name ) {
    return this.stages[ name ];
  }

  setStage(stage ) {
    this.stages[ stage.getName() ] = stage;
  }

  removeStage( name ) {
    let stage = this.stages[ name ];

    delete this.stages[ name ];

    return BbPromise.try(function(){
      if( stage ){
        return stage.destroy();
      }
    });
  }

  validateStageExists( name ){
    return this.stages[ name ] != undefined;
  }

  getRegion( stageName, regionName ){
    if( this.getStage( stageName ) ){
      let stage = this.getStage( stageName );
      if( stage.hasRegion( regionName ) ){
        return stage.getRegion( regionName );
      } else {
        throw new SError(`Region ${regionName} doesnt exist in stage ${stageName}!`);
      }
    } else {
      throw new SError(`Stage ${stageName} doesnt exist in this project!`);
    }
  }

  getAllRegions(stageName ){
    return this.getStage( stageName ).getAllRegions();
  }

  setRegion(stageName, region){
    let stage = this.getStage(stageName);
    stage.setRegion(region);
  }

  validateRegionExists( stageName, regionName ){
    let stage = this.getStage( stageName );

    if( stage ){
      return stage.hasRegion( regionName );
    } else {
      return false;
    }
  }

  setVariables(variables) {
    this.variables = variables;
  }

  getVariables() {
    return this.variables;
  }

  getVariablesObject(stage, region) {
    let vars  = this.getVariables().toObject();
    vars      = _.merge(vars, stage ? stage.getVariables().toObject() : {}, region ? region.getVariables().toObject() : {});
    return vars;
  }

  setTemplates(templates) {
    this.templates = templates;
  }

  getTemplates() {
    return this.templates;
  }
}

module.exports = Project;