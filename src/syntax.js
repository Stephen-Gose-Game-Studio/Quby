"use strict";
var quby = window['quby'] || {};

(function( quby, util ) {
    /**
     * Syntax
     *
     * Objects for defining the abstract syntax tree are defined
     * here. A new function is here for representing every aspect
     * of the possible source code that can be parsed.
     */
    /*
     * Functions, classes, variables and other items in Quby have both a 'name'
     * and a 'callName'. This describes some of their differences.
     *
     * = Names =
     * These are for display purposes. However names should be be considered to
     * be unique, and so entirely different names can refer to the same thing.
     *
     * For example 'object' and 'Object' are different names but can potentially
     * refer to the same thing. However what they refer to also depends on context,
     * for example one might be a function called object and the other might be
     * the Object class. In that context they refer to entirely different things.
     *
     * In short, Names are used for displaying information and should never be
     * used for comparison.
     *
     * = CallNames =
     * callNames however are unique. They are always in lower case, include no
     * spaces and include their context in their formatting. This means it is
     * safe to directly compare callNames (i.e. 'callName1 == callName2').
     * It is also safe to use them in defining JSON object properties.
     *
     * The format functions in quby.runtime should be used for creating callNames
     * from names. They are also designed to ensure that a callName of one context
     * cannot refer to a callName of a different context.
     *
     * This is achieved by appending context unique identifiers to the beginning
     * of the callName stating it's context (function, variable, class, etc).
     *
     * They are 'context unique' because one context prefix does not clash with
     * another contexts prefix.
     */
    quby.syntax = {
        /**
         * There are times when it's much easier to just pass
         * an empty, silently-do-nothing, object into out
         * abstract syntax tree.
         *
         * That is what this is for, it will silently do nothing
         * on both validate and print.
         *
         * Do not extend this! Extend the Syntax one instead.
         */
        EmptyStub: function( offset ) {
            this.offst = offset;
            this.validate = function(v){};
            this.print = function(p){};
        },

        /*
         * These functions do the actual modifications to the class.
         * They alter the class structure, inserting new nodes to add more functionality.
         *
         * They are run as methods of the FunctionGenerator prototype.
         *
         * Add more here to have more class modifiers.
         */
        functionGeneratorFactories: {
            // prefix hard coded into these functions
            get: function( v, fun, param ) {
                return new quby.syntax.FunctionReadGenerator( fun, 'get', param );
            },
            set: function( v, fun, param ) {
                return new quby.syntax.FunctionWriteGenerator( fun, 'set', param );
            },
            getset: function( v, fun, param ) {
                return new quby.syntax.FunctionReadWriteGenerator( fun, 'get', 'set', param );
            },

            read: function( v, fun, param ) {
                return new quby.syntax.FunctionReadGenerator( fun, '', param );
            },
            write: function( v, fun, param ) {
                return new quby.syntax.FunctionWriteGenerator( fun, '', param );
            },
            attr: function( v, fun, param ) {
                return new quby.syntax.FunctionReadWriteGenerator( fun, '', '', param );
            }
        },

        /**
         * Class Modifiers are psudo-functions you can call within a class.
         * For example 'get x' to generate the method 'getX()'.
         */
        /*
         * Lookup the function generator, and then expand the given function into multiple function generators.
         * So get x, y, z becomes three 'get' generators; getX, getY and getZ.
         */
        getFunctionGenerator: function( v, fun ) {
            var name = fun.name.toLowerCase();
            var modifierFactory = quby.syntax.functionGeneratorFactories[ name ];

            if ( modifierFactory ) {
                var params = fun.parameters;

                // this is to avoid building a FactoryGenerators middle-man collection
                if ( params.length === 1 ) {
                    return modifierFactory( v, fun, params.stmts[0] );
                } else {
                    var generators = [];

                    // sort the good parameters from the bad
                    // they must all be Varaibles
                    params.each(function(p) {
                        generators.push( modifierFactory(v, fun, p) );
                    });

                    if ( generators.length > 0 ) {
                        return new quby.syntax.TransparentList( generators );
                    } else {
                        return new quby.syntax.EmptyStub();
                    }
                }
            } else {
                return null;
            }
        },

        Syntax: function (offset) {
            this.offset = offset;
            this.print = function (printer) {
                quby.runtime.error("Internal", "Error, print has not been overridden");
            };

            /**
             * Helper print function, for printing values in an if, while or loop condition.
             * When called, this will store the result in a temporary variable, and test against
             * Quby's idea of false ('false' and 'null').
             */
            this.printAsCondition = function (p) {
                p.appendPre( 'var ', quby.runtime.TEMP_VARIABLE, ';' );

                p.append('((', quby.runtime.TEMP_VARIABLE, '=');
                this.print(p);
                p.append(') !== null && ', quby.runtime.TEMP_VARIABLE, ' !== false)');

                // needed to prevent memory leaks
                p.appendPost( 'delete ', quby.runtime.TEMP_VARIABLE, ';' );
            };

            this.validate = function (v) {
                quby.runtime.error("Internal", "Error, validate has not been overridden");
            };
        },

        /**
         * The most basic type of statement list.
         * Just wraps an array of statements,
         * and passes the calls to validate and print on to them.
         */
        TransparentList: function ( stmts ) {
            this.validate = function(v) {
                for ( var i = 0; i < stmts.length; i++ ) {
                    stmts[i].validate( v );
                }
            };

            this.print = function(p) {
                for ( var i = 0; i < stmts.length; i++ ) {
                    stmts[i].print( p );
                    p.endStatement();
                }
            };
        },

        SyntaxList: function (strSeperator, appendToLast) {
            this.stmts = [];
            this.seperator = strSeperator;
            this.offset = null;
            this.length = 0;

            this.add = function (stmt) {
                this.ensureOffset( stmt );
                this.stmts.push(stmt);
                this.length++;

                return this;
            };
            this.unshift = function(stmt) {
                this.ensureOffset( stmt );
                this.stmts.unshift( stmt );
                this.length++;

                return this;
            };
            this.ensureOffset = function(stmt) {
                if ( !this.offset ) {
                    this.offset = stmt.offset;
                }
            };
            this.print = function (p) {
                var length = this.stmts.length;

                for (var i = 0; i < length; i++) {
                    this.stmts[i].print(p);

                    if (appendToLast || i < length - 1) {
                        p.append(this.seperator);
                    }
                }
            };

            this.set = function( arr ) {
                this.stmts = arr;
                this.length = arr.length;

                if ( arr.length > 0 ) {
                    this.ensureOffset( arr[0] );
                }

                return this;
            }

            this.validate = function (v) {
                for (var i = 0; i < this.stmts.length; i++) {
                    this.stmts[i].validate(v);
                }
            };

            this.each = function( fun ) {
                for ( var i = 0; i < this.stmts.length; i++ ) {
                    fun( this.stmts[i] );
                }
            };
        },

        Statements: function ( stmtsArray ) {
            quby.syntax.SyntaxList.call(this, '', false);

            if ( stmtsArray !== undefined ) {
                this.set( stmtsArray );
            }

            this.print = function (p) {
                p.printArray( this.stmts );
            };
        },

        Parameters: function () {
            quby.syntax.SyntaxList.call(this, ',', false);

            this.blockParam = null;
            this.errorParam = null;
            this.blockParamPosition = -1;

            // Override the add so that block parameters are stored seperately from
            // other parameters.
            this.old_add = this.add;
            this.add = function (param) {
                if (param.isBlockParam) {
                    this.setBlockParam(param);
                } else {
                    this.old_add(param);
                }

                return this;
            };
            this.addFirst = function (param) {
                if (param.isBlockParam) {
                    this.setBlockParam(param);
                } else {
                    this.old_add(param);
                    this.stmts.pop();
                    this.stmts.unshift(param);
                }

                return this;
            };

            /**
             * Sets the block parameter for this set of parameters.
             * This can only be set once, and no more parameters should be set after
             * this has been called.
             *
             * @param blockParam A block parameter for this set of parameters.
             */
            this.setBlockParam = function (blockParam) {
                // You can only have 1 block param.
                // If a second is given, store it later for a validation error.
                if (this.blockParam !== null) {
                    this.errorParam = blockParam;
                } else {
                    this.blockParam = blockParam;
                    // Record the position so we can check if it's the last parameter or not.
                    this.blockParamPosition = this.stmts.length;
                }
            };
            this.getBlockParam = function () {
                return this.blockParam;
            };
            this.old_validate = this.validate;
            this.validate = function (v) {
                if (this.blockParam != null) {
                    if (this.errorParam != null) {
                        v.parseError(this.errorParam.offset, "Only one block parameter is allowed.");
                    } else if (this.blockParamPosition < this.stmts.length) {
                        v.parseError(this.bockParam.offset, "Block parameter must be the last parameter.");
                    }
                }

                this.old_validate(v);

                if (this.blockParam != null) {
                    this.blockParam.validate(v);
                }
            };

            for ( var i = 0; i < arguments.length; i++ ) {
                this.add( arguments[i] );
            }
        },

        Mappings: function ( mappings ) {
            quby.syntax.SyntaxList.call(this, ',', false);

            this.set( mappings );
        },
        Mapping: function (left, right) {
            quby.syntax.Op.call(this, left, right, ":");

            this.print = function (p) {
                this.left.print(p);
                p.append(',');
                this.right.print(p);
            };
        },

        StmtBlock: function (condition, stmts) {
            if (condition != null) {
                quby.syntax.Syntax.call(this, condition.offset);
            } else {
                quby.syntax.Syntax.call(this, stmts.offset);
            }

            this.condition = condition;
            this.stmts = stmts;
            this.validate = function (v) {
                if (this.condition !== null) {
                    this.condition.validate(v);
                }

                this.stmts.validate(v);
            };
        },

        IfStmt: function (ifs, elseIfs, elseBlock) {
            quby.syntax.Syntax.call(this, ifs.offset);
            this.ifStmts = ifs;
            this.elseIfStmts = elseIfs;
            this.elseStmt = elseBlock;

            this.validate = function (v) {
                this.ifStmts.validate(v);

                if (this.elseIfStmts !== null) {
                    this.elseIfStmts.validate(v);
                }

                if (this.elseStmt !== null) {
                    this.elseStmt.validate(v);
                }
            };

            this.print = function (p) {
                this.ifStmts.print(p);

                if ( this.elseIfStmts !== null ) {
                    p.append('else ');
                    this.elseIfStmts.print(p);
                }

                if ( this.elseStmt !== null ) {
                    p.append('else{');
                    this.elseStmt.print(p);
                    p.append('}');
                }
            };
        },

        IfElseIfs: function () {
            quby.syntax.SyntaxList.call(this, 'else ', false);

            this.validate = function (v) {
                for (var i = 0; i < this.stmts.length; i++) {
                    this.stmts[i].validate(v);
                }
            };
        },

        IfBlock: function (condition, stmts) {
            quby.syntax.StmtBlock.call(this, condition, stmts);

            this.print = function (p) {
                p.append('if(');
                this.condition.printAsCondition(p)
                p.append('){').flush();
                this.stmts.print(p);
                p.append('}');
            };
        },

        WhileLoop: function (condition, stmts) {
            quby.syntax.StmtBlock.call(this, condition, stmts);

            this.print = function (p) {
                p.append('while(');
                condition.printAsCondition(p);
                p.append('){').flush();
                stmts.print(p);
                p.append('}');
            };
        },

        UntilLoop: function (condition, stmts) {
            quby.syntax.StmtBlock.call(this, condition, stmts);

            this.print = function (p) {
                p.append('while(!(');
                condition.printAsCondition(p);
                p.append(')){').flush();
                stmts.print(p);
                p.append('}');
            };
        },

        LoopWhile: function (condition, stmts) {
            quby.syntax.StmtBlock.call(this, condition, stmts);

            this.print = function (p) {
                // flush isn't needed here,
                // because statements on the first line will always take place
                p.append('do{');
                stmts.print(p);
                p.append('}while(');
                condition.printAsCondition(p);
                p.append(')');
            };
        },

        LoopUntil: function (condition, stmts) {
            quby.syntax.StmtBlock.call(this, condition, stmts);

            this.print = function (p) {
                p.append('do{');
                stmts.print(p);
                p.append('}while(!(');
                condition.printAsCondition(p);
                p.append('))');
            };
        },

        /**
        * This describes the signature of a class. This includes information
        * such as this classes identifier and it's super class identifier.
        */
        ClassHeader: function (identifier, extendsId) {
            quby.syntax.Syntax.call(this, identifier.offset);

            if (extendsId == null) {
                this.extendsCallName = quby.runtime.ROOT_CLASS_CALL_NAME;
                this.extendsName = quby.runtime.ROOT_CLASS_NAME;
            } else {
                this.extendsCallName = quby.runtime.formatClass(extendsId.value);
                this.extendsName = extendsId.value;
            }

            this.classId = identifier;
            this.extendId = extendsId;
            this.value = identifier.value;

            this.validate = function (v) {
                var name = this.classId.lower;

                if (this.hasSuper()) {
                    var extendName = this.extendId.lower;
                    var extendStr = this.extendId.value;

                    if (name == extendName) {
                        v.parseError(this.offset, "Class '" + this.value + "' is extending itself.");
                    } else if (quby.runtime.isCoreClass(name)) {
                        v.parseError(this.offset, "Core class '" + this.value + "' cannot extend alternate class '" + extendStr + "'.");
                    } else if (quby.runtime.isCoreClass(extendName)) {
                        v.parseError(this.offset, "Class '" + this.value + "' cannot extend core class '" + extendStr + "'.");
                    }
                }
            };

            /**
            * Returns true if there is a _declared_ super class.
            *
            * Note that if this returns false then 'getSuperCallName' and
            * 'getSuperName' will return the name of the root class (i.e.
            * Object).
            */
            this.hasSuper = function () {
                return this.extendId !== null;
            };

            /**
            * Returns the call name for the super class to this class header.
            */
            this.getSuperCallName = function () {
                return this.extendsCallName;
            };

            /**
            * Returns the name of the super class to this class header.
            */
            this.getSuperName = function () {
                return this.extendsName;
            };
        },

        /**
         * TODO
         */
        ModuleDefinition: function (name, statements) {
            quby.syntax.Syntax.call(this, name.offset);

            this.print = function (p) {
                // TODO
            };
            this.validate = function (v) {
                // TODO
            };
        },

        ClassDefinition: function (name, statements) {
            /*
             * Extension Class
             *
             * A real JS prototype, or existing type, which we are adding stuff
             * to.
             */
            if (quby.runtime.isCoreClass(name.classId.lower)) {
                return new quby.syntax.ExtensionClassDefinition(name, statements);
            /*
             * Quby class
             *
             * Entirely user declared and created.
             */
            } else {
                quby.syntax.Syntax.call(this, name.offset);

                this.header = name;
                this.name = name.value;
                this.statements = statements;
                this.callName = quby.runtime.formatClass(name.value);

                this.classValidator = null;
                this.validate = function (v) {
                    v.ensureOutFun(this, "Class '" + this.name + "' defined within a function, this is not allowed.");
                    v.ensureOutBlock(this, "Class '" + this.name + "' defined within a block, this is not allowed.");

                    // validator stored for printing later (validation check made inside)
                    this.classValidator = v.setClass(this);
                    this.header.validate(v);

                    if ( this.statements !== null ) {
                        this.statements.validate(v);
                    }

                    v.unsetClass();
                };

                this.print = function (p) {
                    return this.classValidator.printOnce(p);
                };

                this.getHeader = function () {
                    return this.header;
                };

                /**
                * This returns it's parents callName, unless this does not have
                * a parent class (such as if this is the root class).
                *
                * Then it will return null.
                *
                * @return The callName for the parent class of this class.
                */
                this.getSuperCallName = function () {
                    var superCallName = this.header.getSuperCallName();

                    if (superCallName == this.callName) {
                        return null;
                    } else {
                        return superCallName;
                    }
                };

                return this;
            }
        },

        /**
         * Extension Classes are ones that extend an existing prototype.
         * For example Number, String or Boolean.
         *
         * This also includes the extra Quby prototypes such as Array (really QubyArray)
         * and Hash (which is really a QubyHash).
         */
        ExtensionClassDefinition: function (name, statements) {
            quby.syntax.Syntax.call(this, name.offset);

            this.name = name.value;
            this.header = name;
            this.callName = quby.runtime.formatClass( name.value );
            this.statements = statements;
            this.isExtensionClass = true;

            this.print = function (p) {
                p.setCodeMode(false);

                if ( this.statements !== null ) {
                    p.appendExtensionClassStmts(this.name, this.statements.stmts);
                }

                p.setCodeMode(true);
            };

            this.validate = function (v) {
                v.ensureOutClass(this, "Classes cannot be defined within another class.");

                v.setClass(this);
                this.header.validate(v);

                if ( this.statements !== null ) {
                    this.statements.validate(v);
                }

                v.unsetClass();
            };

            /*
             * The parent class of all extension classes is the root class,
             * always.
             */
            this.getSuperCallName = function () {
                return quby.runtime.ROOT_CLASS_CALL_NAME;
            };
        },

        /**
         * Defines a constructor for a class.
         */
        Constructor: function (sym, parameters, stmtBody) {
            quby.syntax.Function.call(this, sym, parameters, stmtBody);

            this.isConstructor = true;
            this.className = '';
            this.klass = null;

            this.setClass = function (klass) {
                this.klass = klass;

                this.callName = quby.runtime.formatNew(klass.name, this.getNumParameters());

                this.className = klass.callName;
            };

            var oldValidate = this.validate;
            this.validate = function (v) {
                if ( v.ensureInClass(this, "Constructors must be defined within a class.") ) {
                    this.setClass( v.getCurrentClass().klass );

                    this.isExtensionClass = v.isInsideExtensionClass();
                    if ( this.isExtensionClass ) {
                        v.ensureAdminMode( this, "Cannot add constructor to core class: '" + v.getCurrentClass().klass.name + "'" );
                    }

                    v.setInConstructor(true);
                    oldValidate.call(this, v);
                    v.setInConstructor(false);
                }
            };

            this.printParameters = function (p) {
                p.append('(');

                if ( ! this.isExtensionClass ) {
                    p.append( quby.runtime.THIS_VARIABLE, ',' );
                }

                if (
                        this.parameters !== null &&
                        this.parameters.length > 0
                ) {
                    this.parameters.print(p);
                    p.append(',');
                }

                p.append( quby.runtime.BLOCK_VARIABLE, ')' );
            };
            this.printBody = function (p) {
                p.append('{');

                this.printPreVars(p);
                p.endStatement();

                if ( this.stmtBody !== null ) {
                    this.stmtBody.print(p);
                }

                if ( ! this.isExtensionClass ) {
                    p.append('return ', quby.runtime.THIS_VARIABLE, ';');
                }

                p.append( '}' );
            };
        },

        /**
         * Defines a function or method definition.
         */
        Function: function (name, parameters, stmtBody) {
            quby.syntax.Syntax.call(this, name.offset);

            this.isMethod = false;
            this.name = name.value;
            this.parameters = parameters;

            if ( parameters !== null ) {
                this.blockParam = parameters.getBlockParam();
                this.callName   = quby.runtime.formatFun( name.value, parameters.length );
            } else {
                this.blockParam = null ;
                this.callName   = quby.runtime.formatFun( name.value, 0 );
            }

            this.stmtBody = stmtBody;

            this.preVariables = [];

            this.addPreVariable = function (variable) {
                this.preVariables.push(variable);
            };

            this.validate = function (v) {
                this.isMethod = v.isInsideClass();

                var isOutFun = true;
                if (v.isInsideFun()) {
                    var otherFun = v.getCurrentFun();
                    var strOtherType = ( otherFun.isMethod ? "method" : "function" );

                    v.parseError(this.offset, "Function '" + this.name + "' is defined within " + strOtherType + " '" + otherFun.name + "', this is not allowed.");
                    isOutFun = false;
                } else {
                    var strType = (this.isMethod ? "Method" : "Function");

                    v.ensureOutBlock(this, strType + " '" + this.name + "' is within a block, this is not allowed.");
                }

                if ( isOutFun ) {
                    v.defineFun(this);
                    v.pushFunScope(this);
                }

                v.setParameters(true, true);
                if ( this.parameters !== null ) {
                    this.parameters.validate(v);
                }
                v.setParameters(false);

                if ( this.stmtBody !== null ) {
                    this.stmtBody.validate(v);
                }

                if (isOutFun) {
                    v.popScope();
                }
            };

            this.print = function (p) {
                if (!this.isMethod) {
                    p.setCodeMode(false);
                }

                if (this.isMethod && !this.isConstructor) {
                    p.append(this.callName, '=function');
                } else {
                    p.append('function ', this.callName);
                }

                this.printParameters(p);
                this.printBody(p);

                if (!this.isMethod) {
                    p.setCodeMode(true);
                }
            };
            this.printParameters = function (p) {
                p.append('(');

                if ( this.getNumParameters() > 0 ) {
                    this.parameters.print(p);
                    p.append(',');
                }

                p.append( quby.runtime.BLOCK_VARIABLE, ')');
            };
            this.printBody = function (p) {
                p.append('{');

                this.printPreVars(p);
                p.flush();

                if ( this.stmtBody !== null ) {
                    this.stmtBody.print(p);
                }

                // all functions must guarantee they return something...
                p.append('return null;', '}');
            };
            this.printPreVars = function (p) {
                /*
                 * Either pre-print all local vars + the block var,
                 * or print just the block var.
                 */
                if ( this.preVariables.length > 0 ) {
                    p.append( 'var ' );

                    for (var i = 0; i < this.preVariables.length; i++) {
                        if ( i > 0 ) {
                            p.append(',');
                        }

                        var variable = this.preVariables[i];
                        p.append(variable.callName, '=null');
                    }

                    if ( this.blockParam != null ) {
                        p.append(',');
                        this.blockParam.print( p );
                        p.append( '=', quby.runtime.BLOCK_VARIABLE, ';' );
                    }

                    p.endStatement();
                } else if ( this.blockParam != null ) {
                    p.append( 'var ' );
                    this.blockParam.print( p );
                    p.append( '=', quby.runtime.BLOCK_VARIABLE, ';' );
                }
            };

            this.getNumParameters = function () {
                return ( this.parameters !== null ) ?
                        this.parameters.length :
                        0 ;
            };
        },

        /**
         * The base FunctionGenerator prototype. This does basic checks to ensure
         * the function we want to create actually exists.
         *
         * It handles storing common items.
         */
        FunctionGenerator: function( obj, methodName, numParams ) {
            this.obj = obj;
            this.offset = obj.offset;

            this.klass = null;

            // the name of this modifier, i.e. read, write, attr, get, set, getset
            this.modifierName = obj.name;

            // flag used for checking if it's a generator,
            // only used inside this FunctionGenerator
            this.isGenerator = true;

            // the name of the method this generates
            this.name = methodName;
            this.callName = quby.runtime.formatFun( methodName, numParams );

            /* This validation code relies on the fact that when a function
             * is defined on a class, it becomes the current function for that
             * callname, regardless of if it's a diplicate function or not.
             */
            this.validate = function(v) {
                this.klass = v.getCurrentClass();

                // checks for duplicate before this get
                if ( this.validateNameClash(v) ) {
                    v.defineFun( this );
                    v.pushFunScope( this );

                    this.validateInside( v );

                    v.popScope();

                    var _this = this;
                    v.onEndValidate( function(v) { _this.onEndValidate(v); } );
                }
            };

            this.getNumParameters = function() {
                return numParams;
            };

            this.onEndValidate = function(v) {
                this.validateNameClash( v );
            };

            this.validateInside = function(v) {
                // do nothing
            };

            this.validateNameClash = function( v ) {
                var currentFun = this.klass.getFun( this.callName );

                if ( currentFun !== null && currentFun !== this ) {
                    // Give an error message depending on if we are
                    // dealing with a colliding modifier or function.
                    var errMsg = ( currentFun.isGenerator ) ?
                            "'" + this.modifierName + "' modifier in class '" + this.klass.klass.name + "' clashes with modifier '" + currentFun.modifierName + '", for generating: "' + this.name + '" method' :
                            "'" + this.modifierName + "' modifier in class '" + this.klass.klass.name + "' clashes with defined method: '" + this.name + '"' ;

                    v.parseError( this.offset, errMsg );

                    return false;
                } else {
                    return true;
                }
            };
        },

        FunctionAttrGenerator: function (obj, methodName, numParams, fieldObj, proto) {
            var fieldName;
            if ( fieldObj instanceof quby.syntax.Variable || fieldObj instanceof quby.syntax.FieldVariable ) {
                fieldName = fieldObj.identifier;
            } else if ( fieldObj instanceof quby.syntax.Symbol ) {
                fieldName = fieldObj.value;
            } else {
                fieldName = null;
            }

            var fullName = fieldName ? ( methodName + util.string.capitalize(fieldName) ) : methodName ;

            // doesn't matter if fieldName is null for this, as it will be invalid laterz
            quby.syntax.FunctionGenerator.call( this, obj, fullName, numParams );

            // the name of our field, null if invalid
            this.fieldName = fieldName;
            this.fieldObj = fieldObj;

            // this is our fake field
            this.field = null;

            var oldValidate = this.validate;
            this.validate = function(v) {
                if ( this.fieldName !== null ) {
                    oldValidate.call( this, v );
                } else {
                    v.parseError( this.fieldObj.offset, " Invalid parameter for generating '" + this.name + "' method" );
                }
            };

            this.validateInside = function(v) {
                this.field = new proto( new quby.lexer.EmptyIdSym(this.offset, this.fieldName) );
                this.field.validate( v );
            };
        },

        FunctionReadGenerator: function (obj, methodPrefix, field) {
            var FieldVariable2 = function(id) {
                quby.syntax.FieldVariable.call( this, id );
                this.validateField = function(v) { }; // we do this check ourselves later
            };

            quby.syntax.FunctionAttrGenerator.call( this, obj, methodPrefix, 0, field, FieldVariable2 );

            var oldOnEndValidate = this.onEndValidate;
            this.onEndValidate = function(v) {
                oldOnEndValidate.call( this, v );

                if ( this.field ) {
                    if ( ! this.klass.hasFieldCallName(this.field.callName) ) {
                        v.parseError( this.offset, "Field '" + this.field.identifier + "' never written to in class '" + this.klass.klass.name + "' for generating method " + this.name );
                    }
                }
            };

            /*
             * This will be a method.
             */
            this.print = function(p) {
                if ( this.field ) {
                    p.append(this.callName, '=function(){return ');
                    this.field.print( p );
                    p.append(';}');
                }
            };
        },

        FunctionWriteGenerator: function (obj, methodPrefix, field) {
            quby.syntax.FunctionAttrGenerator.call( this,
                    obj, methodPrefix, 1, field,
                    quby.syntax.FieldVariableAssignment
            );

            var oldOnEndValidate = this.onEndValidate;
            this.onEndValidate = function(v) {
                oldOnEndValidate.call( this, v );

                if ( this.field ) {
                    if ( ! this.klass.hasFieldCallName(this.field.callName) ) {
                        v.parseError( this.offset, "Field '" + this.field.identifier + "' never written to in class '" + this.klass.klass.name + "' for generating method " + this.name );
                    }
                }
            };

            /*
             * This will be a method.
             */
            this.print = function(p) {
                if ( this.field ) {
                    p.append(this.callName, '=function(t){return ');
                        this.field.print( p );
                        p.append('=t;');
                    p.append('}');
                }
            };
        },

        FunctionReadWriteGenerator: function( obj, getPre, setPre, fieldObj ) {
            this.getter = new quby.syntax.FunctionReadGenerator( obj, getPre, fieldObj );
            this.setter = new quby.syntax.FunctionWriteGenerator( obj, setPre, fieldObj );

            this.validate = function( v ) {
                this.getter.validate( v );
                this.setter.validate( v );
            };

            this.print = function( p ) {
                this.getter.print( p );
                this.setter.print( p );
            };
        },

        AdminMethod: function (name, parameters, stmtBody) {
            quby.syntax.Function.call(this, name, parameters, stmtBody);

            this.callName = this.name;

            this.old_validate = this.validate;
            this.validate = function (v) {
                v.ensureAdminMode(this, "Admin (or hash) methods cannot be defined without admin rights.");

                if (v.ensureInClass(this, "Admin methods can only be defined within a class.")) {
                    this.old_validate(v);
                }
            }
        },

        /*
        * If this is used from within a class, then it doesn't know if it's a
        * function call, 'foo()', or a method call, 'this.foo()'.
        *
        * This is issue is resolved through 'lateBind' where the class resolves
        * it during validation.
        *
        * This function presumes it's calling a function (not a method) until
        * it is told otherwise.
        *
        * There is also a third case. It could be a special class function,
        * such as 'get x, y' or 'getset img' for generating accessors (and other things).
        */
        FunctionCall: function (name, parameters, block) {
            quby.syntax.Syntax.call(this, name.offset);

            this.name = name.value;
            this.parameters = parameters;

            var numParams = ( parameters !== null ) ? parameters.length : 0 ;
            this.callName = quby.runtime.formatFun( name.value, numParams );

            this.block = block;
            this.functionGenerator = null;

            this.print = function (p) {
                if ( this.functionGenerator ) {
                    this.functionGenerator.print(p);
                } else {
                    if ( this.isMethod ) {
                        p.append(quby.runtime.getThisVariable(this.isInsideExtensionClass), '.');
                    }

                    this.printFunCall(p);
                }
            };
            this.printFunCall = function (p) {
                p.append(this.callName, '(');
                this.printParams(p);
                p.append(')');
            };
            this.printParams = function (p) {
                // parameters
                if (this.getNumParameters() > 0) {
                    this.parameters.print(p);
                    p.append(',');
                }

                // block parameter
                if (this.block !== null) {
                    this.block.print(p);
                } else {
                    p.append('null');
                }
            };

            this.setIsMethod = function () {
                this.isMethod = true;
            };

            /**
             * This FunctionCall needs to declare it's self to the Validator,
             * so the Validator knows it exists. This is done in this call,
             * so it's detached from validating paramters and blocks.
             *
             * In practice, this means you can put your call to validate this as a method,
             * a 'this.method', or something else, by changing this method.
             *
             * By default, this states this is a function.
             */
            this.validateThis = function(v) {
                v.useFun(this);
            };

            this.validate = function (v) {
                var generator = null;

                if ( v.isInsideClassDefinition() ) {
                    this.functionGenerator = generator = quby.syntax.getFunctionGenerator( v, this );

                    if ( generator === null ) {
                        v.parseError(this.offset, "Function '" + this.name + "' called within definition of class '" + v.getCurrentClass().klass.name + "', this is not allowed.");
                    } else if ( block !== null ) {
                        v.parseError(this.offset, "'" + this.name + "' modifier of class '" + v.getCurrentClass().klass.name + "', cannot use a block.");
                    } else {
                        generator.validate( v );
                    }

                    return false;
                } else {
                    if ( this.paramters !== null ) {
                        this.parameters.validate(v);
                    }

                    this.isInsideExtensionClass = v.isInsideExtensionClass();

                    this.validateThis( v );

                    if ( this.block != null ) {
                        this.block.validate(v);
                    }
                }
            };

            this.getNumParameters = function () {
                return ( parameters !== null ) ? parameters.length : 0 ;
            };
        },

        MethodCall: function (expr, name, parameters, block) {
            quby.syntax.FunctionCall.call(this, name, parameters, block);

            this.isMethod = true;
            this.expr = expr;

            this.old_print = this.print;
            this.print = function (p) {
                if (this.expr.isThis) {
                    this.old_print(p);
                } else {
                    this.printExpr(p);
                    p.append('.');
                    this.printFunCall(p);
                }
            };
            this.printExpr = function(p) {
                var e = this.expr;

                if ( e.isLiteral ) {
                    p.append( '(' );
                    e.print( p );
                    p.append( ')' );
                } else {
                    e.print( p );
                }
            };

            this.validateThis = function(v) {
                if ( this.expr.isThis && v.isInsideClass() ) {
                    v.useThisClassFun(this);
                } else {
                    v.useFun( this );
                }
            };

            var old_validate = this.validate;
            this.validate = function (v) {
                this.expr.validate(v);
                old_validate.call(this, v);
            };
        },

        SuperCall: function (name, parameters, block) {
            quby.syntax.FunctionCall.call(this, name, parameters, block);

            this.print = function (p) {
                if ( this.superKlassVal !== undefined ) {
                    var superKlass = this.superKlassVal.klass.name;
                    var superConstructor = quby.runtime.formatNew(superKlass, this.getNumParameters());

                    p.append(superConstructor, '(', quby.runtime.THIS_VARIABLE, ',');
                    this.printParams(p);
                    p.append(')');
                }
            };

            this.validate = function (v) {
                if ( v.ensureInConstructor(this, "Super can only be called from within a constructor.") ) {
                    this.klassVal = v.getCurrentClass();

                    // _this fixes alias issues within the callback
                    var _this = this;

                    v.onEndValidate(function (v) {
                        var header = _this.klassVal.klass.getHeader();
                        var superCallName = header.getSuperCallName();
                        _this.superKlassVal = v.getClass(superCallName);

                        if (_this.superKlassVal == undefined) {
                            if (!quby.runtime.isCoreClass(header.getSuperName().toLowerCase())) {
                                v.parseError(_this.offset, "Calling super to a non-existant super class: '" + _this.klassVal.klass.getHeader().getSuperName() + "'.");
                            }
                        } else if (!_this.superKlassVal.hasNew(_this)) {
                            var superName = _this.superKlassVal.klass.name;
                            v.parseError(_this.offset, "No constructor found with " + _this.getNumParameters() + " parameters for super class: '" + superName + "'.");
                        }
                    });
                }

                if ( this.parameters !== null ) {
                    this.parameters.validate(v);
                }

                if (this.block !== null) {
                    this.block.validate(v);
                }
            };
        },

        NewInstance: function (name, parameters, block) {
            quby.syntax.FunctionCall.call(this, name, parameters, block);

            this.className = quby.runtime.formatClass( name.value );
            this.callName = quby.runtime.formatNew(name.value, this.getNumParameters());

            this.print = function (p) {
                p.append( this.callName, '(' );

                // if a standard class,
                // make a new empty object and pass it in as the first parameter
                if ( ! this.isExtensionClass ) {
                    p.append('new ', this.className, '(),');
                }

                this.printParams(p);

                p.append(')');
            };

            this.validate = function (v) {
                if ( this.parameters !== null ) {
                    this.parameters.validate(v);
                }

                if ( this.block !== null ) {
                    this.block.validate(v);
                }

                // this can only be validated after the classes have been fully defined
                var _this = this;
                v.onEndValidate(function (v) {
                    var klassVal = v.getClass(_this.className);

                    if ( klassVal ) {
                        if (
                               (!klassVal.hasNew(_this))
                            || (klassVal.noNews() && _this.getNumParameters() > 0)
                        ) {
                            var klass = klassVal.klass;

                            if ( klassVal.noNews() && klass.isExtensionClass ) {
                                v.parseError(_this.offset, "Cannot manually create new instances of '" + klass.name + "', it doesn't have a constructor.");
                            } else {
                                v.parseError(_this.offset, "Called constructor for class '" + klass.name + "' with wrong number of parameters: " + _this.getNumParameters());
                            }
                        } else {
                            _this.isExtensionClass = klassVal.klass.isExtensionClass;
                        }
                    } else {
                        v.parseError(_this.offset, "Making new instance of undefined class: '" + _this.name);
                    }
                });
            };
        },

        ReturnStmt: function (expr) {
            quby.syntax.Syntax.call(this, expr.offset);

            this.expr = expr;
            this.print = function (p) {
                p.append('return ');
                this.expr.print(p);
            };
            this.validate = function (v) {
                if (!v.isInsideFun() && !v.isInsideBlock()) {
                    v.parseError(this.offset, "Return cannot be used outside a function or a block.");
                }

                this.expr.validate(v);
            };
        },

        YieldStmt: function (offsetObj, args) {
            quby.syntax.Syntax.call(this, offsetObj.offset);

            if ( args === undefined ) {
                args = null;
            }

            this.parameters = args;
            this.validate = function (v) {
                v.ensureInFun(this, "Yield can only be used from inside a function.");

                if ( this.parameters !== null ) {
                    this.parameters.validate(v);
                }
            };
            this.print = function (p) {
                var paramsLen = ( this.parameters !== null ) ?
                        this.parameters.length :
                        0 ;

                p.appendPre('quby_ensureBlock(', quby.runtime.BLOCK_VARIABLE, ', ', paramsLen, ');');
                p.append(quby.runtime.BLOCK_VARIABLE, '(');
                    if ( this.parameters !== null ) {
                        this.parameters.print( p );
                    }
                p.append(')');
            };
        },

        FunctionBlock: function (parameters, statements) {
            quby.syntax.Syntax.call( this,
                    // only pass in the offset if we have it,
                    // otherwise a null value
                    ( parameters !== null ) ?
                            parameters.offset :
                            null
            );

            this.parameters = parameters;
            this.stmtBody   = statements;

            this.print = function (p) {
                p.append('function(');

                if ( this.parameters !== null ) {
                    this.parameters.print(p);
                }

                p.append('){').flush();

                if ( this.stmtBody !== null ) {
                    this.stmtBody.print(p);
                }

                p.append(
                        'return null;',
                        '}'
                );
            };

            this.validate = function (v) {
                v.pushBlockScope();

                if ( this.parameters !== null ) {
                    v.setParameters(true, false);
                    this.parameters.validate(v);
                    v.setParameters(false);
                }

                if ( this.stmtBody !== null ) {
                    this.stmtBody.validate(v);
                }

                v.popScope();
            };

            this.getNumParameters = function () {
                return ( this.parameters !== null ) ?
                        this.parameters.length :
                        0 ;
            };
        },

        Lambda: function (parameters, statements) {
            quby.syntax.FunctionBlock.call( this, parameters, statements );

            var oldPrint = this.print;
            this.print = function(p) {
                p.append('(');
                oldPrint.call( this, p );
                p.append(')');
            }
        },

        /**
         * @param offset The source code offset for this Expr.
         * @param isResultBool An optimization flag. Pass in true if the result of this Expression will always be a 'true' or 'false'. Optional, and defaults to false.
         */
        Expr: function (offset, isResultBool) {
            quby.syntax.Syntax.call(this, offset);

            this.isResultBool = (!! isResultBool);

            var oldPrintAsCondition = this.printAsCondition;
            this.printAsCondition = function (p) {
                if ( this.isResultBool ) {
                    this.print(p);
                } else {
                    oldPrintAsCondition.call( this, p );
                }
            };

            return this;
        },

        /**
         * This is to allow an expression, mostly an operation, to swap it's
         * self out and rebalance the expression tree.
         *
         * It does this by copying it's self, then inserting the copy deeper
         * into the expression tree, and this then referenced the expression
         * tree now references the top of the tree.
         */
        BalancingExpr: function( offset, isResultBool )
        {
            quby.syntax.Expr.call( this, offset, isResultBool );

            this.balanceDone = false;
            this.isBalanced = function( v ) {
                if ( this.balanceDone ) {
                    return true;
                } else {
                    var newExpr = this.rebalance();

                    if ( newExpr !== this ) {
                        newExpr.validate( v );
                        return false;
                    } else {
                        return true;
                    }
                }
            };

            this.rebalance = function() {
                this.balanceDone = true;

                var expr = this.onRebalance();

                if ( expr !== this ) {
                    this.expr = expr;

                    this.validate = function(v) {
                        this.expr.validate(v);
                    }
                    this.print = function(p) {
                        this.expr.print(p);
                    }
                    this.printAsCondition = function(p) {
                        this.expr.printAsCondition(p);
                    }

                    return expr;
                } else {
                    return this;
                }
            };

            this.onRebalance = function() {
                throw new Error("rebalance is not implemented");
            };
        },

        ExprParenthesis: function( expr ) {
            quby.syntax.Syntax.call(this, expr.offset);

            this.expr = expr;

            this.validate = function(v) {
                this.expr.validate(v);
            };

            this.print = function(p) {
                p.append('(');
                this.expr.print(p);
                p.append(')');
            };

            this.printAsCondition = function(p) {
                p.append('(');
                this.expr.printAsCondition(p);
                p.append(')');
            };
        },

        /*
         * All single operations have precedence of 1.
         */
        SingleOp: function (expr, strOp, isResultBool) {
            quby.syntax.BalancingExpr.call(this, expr.offset, isResultBool);

            this.expr = expr;
            this.validate = function (v) {
                if ( this.isBalanced(v) ) {
                    this.expr.validate(v);
                }
            };
            this.print = function (p) {
                p.append('(', strOp);
                this.expr.print(p);
                p.append(')');
            };

            this.onRebalance = function() {
                // swap if expr has higher precedence then this
                var expr = this.expr,
                    exprPrecedence = expr.precedence;

                if ( expr.rebalance !== undefined ) {
                    expr = expr.rebalance();
                }

                if (
                        exprPrecedence !== undefined &&
                        exprPrecedence > 1
                ) {
                    var copy = util.clone( this );
                    copy.expr = expr.performBalanceSwap(copy, 1);
                    return expr;
                } else {
                    return this;
                }
            };
        },

        SingleSub: function (expr) {
            return quby.syntax.SingleOp.call(this, expr, "-", false );
        },

        Not: function (expr) {
            var op = quby.syntax.SingleOp.call( this, expr, "!", true );

            op.print = function(p) {
                var temp = p.getTempVariable();

                p.appendPre('var ', temp, ';');

                p.append('(((', temp, '=');
                this.expr.print(p);
                p.append(') === null || ', temp, ' === false) ? true : false)');

                // needed to prevent memory leaks
                p.appendPost('delete ', temp, ';');
            };

            return op;
        },

        /**
         * @param left
         * @param right
         * @param strOp
         * @param isResultBool
         * @param precedence Lower is higher, must be a number.
         */
        Op: function (left, right, strOp, isResultBool, precedence) {
            quby.syntax.BalancingExpr.call( this, left.offset, isResultBool );

            if ( precedence === undefined ) {
                throw new Error("undefined precedence given.");
            }
            this.precedence = precedence;

            this.left = left;
            this.right = right;
            
            this.print = function (p) {
                var bracket = quby.compilation.hints.doubleBracketOps();

                if ( bracket ) {
                    p.append('((');
                } else {
                    p.append('(');
                }
                this.left.print(p);
                if ( bracket ) {
                    p.append( ')' );
                }

                p.append(strOp);

                if ( bracket ) {
                    p.append( '(' );
                }
                this.right.print(p);
                if ( bracket ) {
                    p.append('))');
                } else {
                    p.append(')');
                }
            };
            this.validate = function (v) {
                if ( this.isBalanced(v) ) {
                    right.validate(v);
                    left.validate(v);
                }
            };

            this.onRebalance = function() {
                var right = this.right;

                if ( right.rebalance !== undefined ) {
                    right = right.rebalance();
                }

                var rightPrecedence = right.precedence,
                    precedence = this.precedence;

                if (
                        rightPrecedence !== undefined &&
                        rightPrecedence > precedence
                ) {
                    var copy = util.clone( this );
                    copy.right = right.performBalanceSwap( copy, precedence );

                    return right;
                } else {
                    return this;
                }
            };

            this.performBalanceSwap = function( newLeft, precedence ) {
                var leftP = this.left.precedence,
                    oldLeft;
                
                /*
                 * Left is either an node,
                 * or it has higher precedence.
                 */
                if ( leftP !== undefined ) {
                    if ( leftP <= precedence ) {
                        oldLeft = this.left;
                        this.left = newLeft;
                        return oldLeft;
                    } else {
                        return this.left.performBalanceSwap( newLeft, precedence );
                    }
                } else {
                    oldLeft = this.left;
                    this.left = newLeft;
                    return oldLeft;
                }

                return null;
            };
        },

        /*
         * These are in order of precedence,
         * numbers and order taken from: http://en.wikipedia.org/wiki/Order_of_operations
         *
         * Lower is higher!
         */

        /* Shifting Operations */
        ShiftLeft: function (left, right) {
            quby.syntax.Op.call(this, left, right, "<<", 5);
        },

        ShiftRight: function (left, right) {
            quby.syntax.Op.call(this, left, right, ">>", 5);
        },

        /* Greater/Less Comparison */
        LessThan: function (left, right) {
            quby.syntax.Op.call(this, left, right, "<", true, 6);
        },

        LessThanEqual: function (left, right) {
            quby.syntax.Op.call(this, left, right, "<=", true, 6);
        },

        GreaterThan: function (left, right) {
            quby.syntax.Op.call(this, left, right, ">", true, 6);
        },

        GreaterThanEqual: function (left, right) {
            quby.syntax.Op.call(this, left, right, ">=", true, 6);
        },

        /* Equality Comparison */
        Equality: function (left, right) {
            quby.syntax.Op.call(this, left, right, "==", true, 7);
        },

        NotEquality: function (left, right) {
            quby.syntax.Op.call(this, left, right, "!=", true, 7);
        },

        /* Bit Functions */

        BitAnd: function (left, right) {
            quby.syntax.Op.call(this, left, right, "&", false, 8);
        },

        BitOr: function (left, right) {
            quby.syntax.Op.call(this, left, right, "|", false, 10);
        },

        BoolOp: function(left, right, syntax, precedence) {
            quby.syntax.Op.call(this, left, right, syntax, false, precedence);

            var oldPrint = this.print;

            /**
             * Temporarily swap to the old print, then print as a condition,
             * then swap back.
             */
            this.print = function(p) {
                var tempPrint = this.print;
                
                this.print = oldPrint;
                this.printAsCondition(p);
                this.print = tempPrint;
            };
        },

        BoolOr: function (left, right) {
            quby.syntax.BoolOp.call(this, left, right, "||", 12);

            this.print = function(p) {
                var temp = p.getTempVariable();

                p.appendPre('var ', temp, ';');

                p.append('(((', temp, '=');
                this.left.print(p);
                p.append(') === null || ', temp, ' === false) ? (');
                this.right.print(p);
                p.append(') : ', temp, ')');

                // needed to prevent memory leaks
                p.appendPost('delete ', temp, ';');
            };
        },

        BoolAnd: function (left, right) {
            quby.syntax.BoolOp.call(this, left, right, "&&", 11);

            this.print = function(p) {
                var temp = p.getTempVariable();

                p.appendPre('var ', temp, ';');

                p.append('(((', temp, '=');
                this.left.print(p);
                p.append(') === null || ', temp, ' === false) ? ', temp, ' : (');
                this.right.print(p);
                p.append('))');

                // needed to prevent memory leaks
                p.appendPost('delete ', temp, ';');
            };
        },

        /* ### Maths ### */
        Divide: function (left, right) {
            quby.syntax.Op.call(this, left, right, "/", false, 3);
        },

        Mult: function (left, right) {
            quby.syntax.Op.call(this, left, right, "*", false, 3);
        },

        Mod: function (left, right) {
            quby.syntax.Op.call(this, left, right, "%", false, 3);
        },

        Add: function (left, right) {
            quby.syntax.Op.call(this, left, right, "+", false, 4);
        },

        Sub: function (left, right) {
            quby.syntax.Op.call(this, left, right, "-", false, 4);
        },

        Power: function (left, right) {
            quby.syntax.Op.call(this, left, right, false, 2);
console.log('kdkd');
console.log( this.validate );

            this.print = function (p) {
                p.append('Math.pow(');
                this.left.print(p);
                p.append(',');
                this.right.print(p);
                p.append(')');
            };
        },

        /* ### Assignments ### */
        Assignment: function (left, right) {
            quby.syntax.Op.call(this, left, right, '=', false, 14);

            this.print = function (p) {
                this.left.print(p);
                p.append('=');
                this.right.print(p);
            };
        },

        ArrayAssignment: function (arrayAccess, expr) {
            quby.syntax.Syntax.call(this, arrayAccess.offset);

            this.left = arrayAccess;
            this.right = expr;
            this.print = function (p) {
                p.append('quby_setCollection(');
                this.left.array.print(p);
                p.append(',');
                this.left.index.print(p);
                p.append(',');
                this.right.print(p);
                p.append(')');
            };
            this.validate = function (v) {
                this.right.validate(v);
                this.left.validate(v);
            };
        },

        Identifier: function (identifier, callName) {
            quby.syntax.Expr.call(this, identifier.offset);

            this.identifier = identifier.value;
            this.callName = callName;
            this.print = function (p) {
                p.append(this.callName);
            };
        },
        FieldIdentifier: function (identifier) {
            // set temporary callName (the identifier.value)
            quby.syntax.Identifier.call(this, identifier, identifier.value);

            this.validate = function (v) {
                if (
                        v.ensureInClass(this, "Field '" + this.identifier + "' is used outside of a class, they can only be used inside.")
                ) {
                    // set the correct field callName
                    this.callName = quby.runtime.formatField(
                            v.getCurrentClass().klass.name,
                            this.identifier
                    );
                    this.isInsideExtensionClass = v.isInsideExtensionClass();

                    this.validateField(v);
                }
            };
            this.validateField = function (v) {
                quby.runtime.error("Internal", "Error, validateField of FieldIdentifier has not been overrided.");
            };
        },

        VariableAssignment: function (identifier) {
            quby.syntax.Identifier.call(this, identifier, quby.runtime.formatVar(identifier.value));

            this.validate = function (v) {
                v.assignVar(this);
                // blocks can alter local variables, allowing var prevents this.
                this.useVar = !v.isInsideBlock();
            };
            this.oldPrint = this.print;
            this.print = function (p) {
                if (this.useVar) {
                    p.append('var ');
                }
                this.oldPrint(p);
            }
        },
        FieldVariableAssignment: function (identifier) {
            // value is set temporarily
            quby.syntax.FieldIdentifier.call(this, identifier);

            this.validateField = function (v) {
                v.assignField(this);
            };
            this.print = function (p) {
                p.append(quby.runtime.getThisVariable(this.isInsideExtensionClass), '.', this.callName);
            };
        },
        GlobalVariableAssignment: function (identifier) {
            quby.syntax.Identifier.call( this, identifier, quby.runtime.formatGlobal(identifier.value) );

            this.validate = function (v) {
                // check if the name is blank, i.e. $
                if ( this.identifier.length === 0 ) {
                    v.parseError( this.offset, "Global variable name is blank" );
                } else {
                    v.assignGlobal(this);
                }
            };
        },

        /* ### Variables ### */
        Variable: function (identifier) {
            quby.syntax.Identifier.call(this, identifier, quby.runtime.formatVar(identifier.value));

            this.validate = function (v) {
                if (v.isInsideParameters()) {
                    // it presumes scope has already been pushed by the function it's within
                    if (v.containsLocalVar(this)) {
                        v.parseError(this.offset, "Parameter variable name used multiple times, var: '" + this.identifier + "'.");
                    }

                    v.assignVar(this);
                } else {
                    if (!v.containsVar(this)) {
                        v.parseError(this.offset, "Variable used before it's assigned to, var: " + this.identifier);
                    }
                }
            };
        },
        GlobalVariable: function (identifier) {
            quby.syntax.Identifier.call(this, identifier, quby.runtime.formatGlobal(identifier.value));

            this.isGlobal = true;
            this.print = function (p) {
                p.append('quby_checkGlobal(', this.callName, ',\'', this.identifier, '\')');
            };
            this.validate = function (v) {
                if (v.ensureOutParameters(this, "Global variable cannot be used as a parameter, global: '" + this.identifier + "'.")) {
                    v.useGlobal(this);
                }
            };
        },
        ParameterBlockVariable: function (identifier) {
            quby.syntax.Variable.call(this, identifier);

            this.isBlockParam = true;
            this.old_validate = this.validate;
            this.validate = function (v) {
                v.ensureInFunParameters(this, "Block parameters must be defined within a functions parameters.");
                this.old_validate(v);
            };
        },
        FieldVariable: function (sym) {
            quby.syntax.FieldIdentifier.call(this, sym);

            this.klass = null;

            var oldValidate = this.validate;
            this.validate = function (v) {
                if (
                        v.ensureOutParameters( this, "Class field '" + this.identifier + "' used as a parameter." ) &&
                        v.ensureInMethod( this, "Class field '" + this.identifier + "' is used outside of a method." )
                ) {
                    oldValidate.call( this, v );
                    this.klass = v.getCurrentClass().klass;
                }
            };
            this.validateField = function (v) {
                v.useField( this );
                this.isConstructor = v.isConstructor();
            }

            this.print = function (p) {
                if ( this.klass ) {
                    var strName = this.identifier +
                            quby.runtime.FIELD_NAME_SEPERATOR +
                            this.klass.name ;

                    // this is about doing essentially either:
                    //     ( this.field == undefined ? error('my_field') : this.field )
                    //  ... or ...
                    //     getField( this.field, 'my_field' );
                    var thisVar = quby.runtime.getThisVariable(this.isInsideExtensionClass);
                    if (quby.compilation.hints.useInlinedGetField()) {
                        p.append(
                                '(',
                                    thisVar, ".", this.callName,
                                    '===undefined?quby.runtime.fieldNotFoundError(' + thisVar + ',"', strName, '"):',
                                    thisVar, ".", this.callName,
                                ')'
                        );
                    } else {
                        p.append(
                                "quby_getField(",
                                    thisVar, ".", this.callName, ',',
                                    thisVar, ",'",
                                    strName,
                                "')"
                        );
                    }
                }
            };
        },
        ThisVariable: function (sym) {
            quby.syntax.Syntax.call(this, sym.offset);

            this.isThis = true;
            this.validate = function (v) {
                if (v.ensureOutParameters(this, "'this' object is referenced as a parameter (which isn't allowed).")) {
                    v.ensureInMethod(this, "'this' object is referenced outside of a class method (or you've named a variable 'this' which isn't allowed).");
                }

                this.isInsideExtensionClass = v.isInsideExtensionClass();
                this.isConstructor = v.isConstructor();
            };
            this.print = function (p) {
                p.append(quby.runtime.getThisVariable(this.isInsideExtensionClass));
            };
        },

        /* ### Arrays ### */
        ArrayAccess: function (array, index) {
            quby.syntax.Syntax.call(this, array.offset);

            this.array = array;
            this.index = index;
            this.print = function (p) {
                p.append('quby_getCollection(');
                this.array.print(p);
                p.append(',');
                this.index.print(p);
                p.append(')');
            };
            this.validate = function (v) {
                this.array.validate(v);
                this.index.validate(v);
            };
        },
        ArrayDefinition: function (parameters) {
            var offset;
            if ( parameters ) {
                offset = parameters.offset;
            } else {
                parameters = null;
                offset = null;
            }

            quby.syntax.Syntax.call(this, offset);

            this.parameters = parameters;
            this.print = function (p) {
                p.append('(new QubyArray([');

                if ( this.parameters !== null ) {
                    this.parameters.print(p);
                }

                p.append(']))');
            };
            this.validate = function (v) {
                if ( this.parameters !== null ) {
                    parameters.validate(v);
                }
            };
        },
        HashDefinition: function (parameters) {
            quby.syntax.ArrayDefinition.call(this, parameters);

            this.print = function (p) {
                p.append('(new QubyHash(');

                if ( this.parameters !== null ) {
                    this.parameters.print(p);
                }

                p.append('))');
            };
        },

        /* Literals */
        Literal: function (val, value, isTrue) {
            quby.syntax.Expr.call(this, val.offset);

            this.isLiteral = true;
            this.isTrue = (!!isTrue);

            if (value) {
                this.value = value;
            } else {
                this.value = val.value;
            }

            this.validate = function (v) {
                // do nothing
            };
            this.print = function (p) {
                var str = String(this.value);
                p.append( String(this.value) );
            };

            /**
             * If this literal evaluates to true, then 'true' is printed.
             * Otherwise 'false'.
             */
            this.printAsCondition = function(p) {
                if ( this.isTrue ) {
                    p.append('true');
                } else {
                    p.append('false');
                }
            };
        },

        Symbol: function (sym) {
            quby.syntax.Literal.call(this, sym);
            this.callName = quby.runtime.formatSymbol(this.value);

            this.validate = function (v) {
                v.addSymbol(this);
            };
            this.print = function (p) {
                p.append(this.callName);
            };
        },
        String: function (sym) {
            sym.value = sym.value.replace( /\n/g, "\\n" );
            return new quby.syntax.Literal(sym, undefined, true);
        },

        Number: function(sym) {
            quby.syntax.Literal.call(this, sym, undefined, true);

            this.validate = function(v) {
                var origNum = this.value,
                    num = origNum.replace( /_+/g, '' ),
                    decimalCount = 0;

                // TODO validate num

                if ( num.indexOf('.') === -1 ) {
                    this.value = num|0;
                } else {
                    this.value = parseFloat(num);
                }
            };
        },
        Bool: function (sym) {
            return new quby.syntax.Literal( sym, undefined, sym.value );
        },
        Null: function (sym) {
            return new quby.syntax.Literal(sym, 'null', false);
        },

        /* Other */
        PreInline: function(sym) {
            quby.syntax.Syntax.call(this, sym.offset);

            this.isPrinted = false;
            this.print = function (p) {
                if ( ! this.isPrinted ) {
                    p.append( sym.value );
                    this.isPrinted = true;
                }
            };
            this.validate = function (v) {
                v.ensureAdminMode(
                        this, "Inlining JavaScript is not allowed outside of admin mode."
                );
                v.addPreInline( this );
            };
        },

        Inline: function (sym) {
            quby.syntax.Syntax.call(this, sym.offset);

            this.print = function (p) {
                p.append(sym.value);
            };
            this.printAsCondition = function(p) {
                this.print(p);
            };
            this.validate = function (v) {
                v.ensureAdminMode(this, "Inlining JavaScript is not allowed outside of admin mode.");
            };
        }
    };
})( quby, util );