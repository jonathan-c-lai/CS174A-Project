import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene, Texture
} = tiny;

const {
    Textured_Phong
} = defs;

const NUM_ASTEROID_TYPES = 3
const ASTEROID_SPAWN_Z_COORD = -70
const ASTEROID_SPAWN_X_COORD_MAX = 70
const ASTEROID_NATURAL_ROTATION = 8.0

const MAX_ASTEROID_FRAMES_TO_ORIGIN = 1000
const MIN_ASTEROID_FRAMES_TO_ORIGIN = 300

const ASTEROID_SPAWN_PERIOD = 0.5

const MAX_SPACESHIP_ROTATION = 1
const SPACESHIP_ROTATION_SPEED = 20 // smaller number, higher speed
const SPACESHIP_DISTANCE_FROM_ORIGIN = 5

// adding new this.asteroid_xxxxxxxx:
    // add variable in constructor
    // assign it value when spawn asteroid in spawn_asteroid
    // add what happens when asteroid destroyed in cull_asteroids

export class Asteroids_Demo extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {
            asteroid1: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            asteroid2: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(1),
            asteroid3: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            background_sphere: new defs.Subdivision_Sphere(4),
            background_cube: new defs.Cube(),

            spaceship: new defs.Cube() // TODO: Make it a pretty spaceship, right now temp shape
        };

        // *** Materials
        this.materials = {
            asteroid1: new Material(new defs.Phong_Shader(), 
                {ambient: 0, diffusivity: 1, specular: 1, color: color(0.5, 0.5, 0.5, 1)}),
            asteroid2: new Material(new defs.Phong_Shader(), 
                {ambient: 0, diffusivity: 1, specular: 1, color: color(0.7, 0.9, 0.9, 1)}),
            asteroid3: new Material(new defs.Phong_Shader(), 
                {ambient: 0, diffusivity: 1, specular: 1, color: color(0.3, 0.5, 0.3, 1)}),
            background: new Material(new Texture_Rotate(), {
                color: hex_color("#000000"),
                ambient: 1, specular: 0, diffusivity: 0,
                texture: new Texture("assets/galaxy_2048.jpg", "LINEAR_MIPMAP_LINEAR")
            }),

            // TODO: modify for make spaceship pretty
            spaceship: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
        }

        this.initial_camera_location = Mat4.look_at(vec3(0, 8, 15), vec3(0, 0, -3), vec3(0, 1, 0));

        // need asteroid_type because there was bug that if asteroid removed, the indices would get shifted down
        // so asteroid_type retains the asteroid type of every asteroid
        this.asteroid_type = [];
        // need asteroids inital positions
        this.asteroid_init_pos = [];
        // need asteroid positions
        this.asteroid_pos = [];
        // need # frames for asteroid to reach origin
        this.asteroid_frames_till_origin = [];
        this.asteroid_rotation_dir = [];
        // asteroids, start with one asteroid
        this.num_asteroids = 0;

        // asteroid spawner helping
        this.last_asteroid_spawned_t = 0;

        // background model transform
            //this.background_sphere_model_transform = Mat4.identity().times(Mat4.translation(0, 0, -60)).times(Mat4.scale(100, 100, 0.01));
        this.background_sphere_model_transform = Mat4.identity().times(Mat4.translation(0, 0, -30)).times(Mat4.scale(50, 50, 50));


        this.spaceshipRotationAmount = 0
        this.turnLeft = false;
        this.turnRight = false;
    }   

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button("Spawn Asteroid", ["c"], () => {
            this.spawn_asteroid();
        });
        this.key_triggered_button("Rotate Left", ["q"], ()=> this.turnLeft = true, undefined, ()=>this.turnLeft = false)
        this.key_triggered_button("Rotate Right", ["e"], ()=> this.turnRight = true, undefined, ()=>this.turnRight = false)
    }

    display(context, program_state) {
        // display():  Called once per frame of animation.
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(this.initial_camera_location);
        }

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 5, 5, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];
        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        let t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;

        // draw background
        this.draw_background(context, program_state);

        // update asteroid positions, cull if at origin, draw resulting asteroids
        this.update_asteroids();
        this.cull_asteroids();
        this.draw_asteroids(context, program_state, t);

        this.draw_spaceship(context, program_state);

        // spawn asteroid every so often
        if (t - this.last_asteroid_spawned_t > ASTEROID_SPAWN_PERIOD) {
            this.spawn_asteroid();  
            this.last_asteroid_spawned_t = t;
        }
    }

    // draw background
    draw_background(context, program_state) {
        this.shapes.background_sphere.arrays.texture_coord.forEach(
            (v, i, l) => l[i] = vec(v[0]*5, v[1]*5)
        )
        this.shapes.background_sphere.draw(context, program_state, this.background_sphere_model_transform, this.materials.background);
    }

    // spawn asteroid
    spawn_asteroid() {
        // need to redo the new_asteroid_transformation everytime spawn new
        // asteroid spawn at the top -- spawn from -30 to 30 x value
        // calculate new spawn location
        let x = Math.random()*(ASTEROID_SPAWN_X_COORD_MAX + ASTEROID_SPAWN_X_COORD_MAX)-ASTEROID_SPAWN_X_COORD_MAX;
        let y = 0;
        let z = ASTEROID_SPAWN_Z_COORD;
        let frames_until_asteroid_to_origin = Math.random()*(MAX_ASTEROID_FRAMES_TO_ORIGIN - MIN_ASTEROID_FRAMES_TO_ORIGIN) + (MIN_ASTEROID_FRAMES_TO_ORIGIN)
        
        // push the attributes to system
        this.num_asteroids += 1
        this.asteroid_init_pos.push([x,y,z]);
        this.asteroid_pos.push([x,y,z]);
        this.asteroid_type.push((this.num_asteroids - 1) % NUM_ASTEROID_TYPES);
        this.asteroid_frames_till_origin.push(frames_until_asteroid_to_origin);
        this.asteroid_rotation_dir.push([Math.random(), Math.random(), Math.random()])

        console.log("new asteroid spawned w/ pos: ", x,y,z);
    }

    // update position of asteroids
    update_asteroids() {
        for (let i = 0; i < this.num_asteroids; i += 1) {
            // calculate new position
            let new_x = this.asteroid_pos[i][0] - (this.asteroid_init_pos[i][0] / this.asteroid_frames_till_origin[i])
            let new_y = this.asteroid_pos[i][1] - (this.asteroid_init_pos[i][1] / this.asteroid_frames_till_origin[i])
            let new_z = this.asteroid_pos[i][2] - (this.asteroid_init_pos[i][2] / this.asteroid_frames_till_origin[i])

            this.asteroid_pos[i] = [new_x, new_y, new_z]
        }
    }

    draw_asteroids(context, program_state, t) {
        // calculate the point they are in rotation
        let rotation = (t*Math.PI / ASTEROID_NATURAL_ROTATION);

        // draw asteroids
        for (let i = 0; i < this.num_asteroids; i += 1) {
            // make the transform with some rotation
            let asteroid_transform = (Mat4.identity().times(Mat4.translation(this.asteroid_pos[i][0], this.asteroid_pos[i][1], this.asteroid_pos[i][2]))
                                            .times(Mat4.rotation(rotation, this.asteroid_rotation_dir[i][0], this.asteroid_rotation_dir[i][1], this.asteroid_rotation_dir[i][2])));
            if(this.asteroid_type[i] == 0){
                this.shapes.asteroid1.draw(context, program_state, asteroid_transform, this.materials.asteroid1);
            }
            else if (this.asteroid_type[i] == 1) {
                this.shapes.asteroid2.draw(context, program_state, asteroid_transform, this.materials.asteroid2);
            }
            else if (this.asteroid_type[i] == 2) {
                this.shapes.asteroid3.draw(context, program_state, asteroid_transform, this.materials.asteroid3);
            }
        }
    }

    // delete asteroids that are too far
    cull_asteroids() {
        for (let i = 0; i < this.num_asteroids; i += 1) {
            if (this.asteroid_pos[i][2] > 0) {
                console.log("asteroid removed");
                this.num_asteroids -= 1;
                this.asteroid_type.splice(i,1);
                this.asteroid_init_pos.splice(i,1);
                this.asteroid_pos.splice(i,1);
                this.asteroid_frames_till_origin.splice(i,1);
                this.asteroid_rotation_dir.splice(i,1);
                i -= 1;
            }
        }
    }

    draw_spaceship(context, program_state) {

        const yellow = hex_color("#fac91a");

        if (this.turnLeft) {
            if (this.spaceshipRotationAmount < MAX_SPACESHIP_ROTATION)
                this.spaceshipRotationAmount += MAX_SPACESHIP_ROTATION/SPACESHIP_ROTATION_SPEED

        }
        if (this.turnRight) {
            if (this.spaceshipRotationAmount > -1 * MAX_SPACESHIP_ROTATION)
                this.spaceshipRotationAmount -= MAX_SPACESHIP_ROTATION/SPACESHIP_ROTATION_SPEED
        }
        let model_transform = Mat4.identity()
        let translation = Mat4.translation(0,0,-1 * SPACESHIP_DISTANCE_FROM_ORIGIN)
        let rotation = Mat4.rotation(Math.PI+this.spaceshipRotationAmount, 0, 1, 0)
        let rotationInverse = Mat4.inverse(rotation)
        let translationInverse = Mat4.inverse(translation)

        // model_transform = model_transform.times(rotation) // .times(rotation)


        // model_transform = model_transform.times(rotation)
        model_transform = model_transform.times(translation).times(rotation).times(translationInverse)
        this.shapes.spaceship.draw(context, program_state, model_transform, this.materials.spaceship.override({color: yellow}));

    }
}

class Texture_Rotate extends Textured_Phong {
    // TODO:  Modify the shader below (right now it's just the same fragment shader as Textured_Phong) for requirement #7.
    fragment_glsl_code() {
        return this.shared_glsl_code() + `
            varying vec2 f_tex_coord;
            uniform sampler2D texture;
            uniform float animation_time;
            void main(){
                float slide_amnt = mod(2.0*animation_time, 4.0);
                vec2 scroll_tex_coord = vec2(f_tex_coord.x - slide_amnt, f_tex_coord.y);
                vec4 tex_color = texture2D( texture, scroll_tex_coord);
                
                if( tex_color.w < .01 ) discard;
                                                                         // Compute an initial (ambient) color:
                gl_FragColor = vec4( ( tex_color.xyz + shape_color.xyz ) * ambient, shape_color.w * tex_color.w ); 
                                                                         // Compute the final color with contributions from lights:
                gl_FragColor.xyz += phong_model_lights( normalize( N ), vertex_worldspace );
        } `;
    }
}